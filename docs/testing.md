# 测试与可观测性

本文只记录自动回归和 Worker 日志约定。运行方式见 [README.md](../README.md)，系统设计见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

## 1. 一条命令

```bash
cd worker
pnpm test
```

当前不引入 Vitest / Jest。单测使用 Node 自带 `node:test`；一个很薄的 `tests/register-ts.cjs` 只负责用项目现有 TypeScript 把被测 `.ts` 模块转为 CommonJS，不提供 mock 框架或额外运行时。

## 2. 当前覆盖

### 单测

`tests/unit/pickup-code.test.cjs`：

- 6 位取件码只使用无歧义字符
- 取件码哈希对大小写、空格、连字符统一归一化

`tests/unit/secret.test.cjs`：

- 生产缺失 / 占位 `PICKUP_CODE_SECRET` 时 fail-closed
- development 本地兜底
- HMAC 稳定性
- 管理员密码比较
- 下载 token 与 `fileKey` 绑定
- 管理员 token 验证与篡改失败

### 本地 D1 / R2 集成

`tests/integration/parcel-flow.test.cjs` 使用仓库自己的 Wrangler：

1. 为本次测试创建独立 `.test-state-<pid>`
2. 对该目录初始化真实本地 D1 schema
3. 启动 `wrangler dev`
4. 验证文本寄件与规范化取件码
5. 验证文件登记、上传 token、R2 上传、确认、签名下载
6. 验证阅后即焚首次成功、第二次拒绝
7. 验证管理员未授权、登录、统计、列表、删除与 DELETED 查询
8. 结束 Worker 并删除临时 state

它不会读取或污染日常 `worker/.wrangler/state`。

## 3. 还没有覆盖

- Turnstile 真实远端校验（本地 development 按设计跳过）

能在本地可靠验证的路径继续加在现有集成层，不再平行引入第二套测试框架。

## 4. 结构化日志

`worker/src/utils/log.ts` 输出结构化对象，逻辑字段固定包含：

```json
{"timestamp":"...","level":"info|warn|error","event":"..."}
```

当前事件：

| event | 含义 |
| --- | --- |
| `parcel.create.success` | 文本 / Markdown Parcel 创建成功 |
| `parcel.upload.registered` | 文件 Parcel 登记成功，等待上传 |
| `parcel.pickup.success` | 取件成功 |
| `parcel.pickup.rejected` | 取件被状态、过期、次数等规则拒绝 |
| `turnstile.rejected` | Turnstile token 缺失或无效 |
| `turnstile.misconfigured` | 生产缺 Turnstile Secret |
| `request.rate_limited` | Cloudflare Rate Limiting binding 拒绝请求 |
| `request.unhandled` | Hono 未捕获异常 |
| `cleanup.expired.completed` | Cron 清理完成，含删除计数 |
| `cleanup.expired.failed` | Cron 清理某 Parcel 失败 |

日志禁止写入：明文取件码、`PICKUP_CODE_SECRET`、Turnstile Secret、管理员口令、上传 token、正文 / 文件内容、原始 IP。

生产端通过 Workers Logs 持久化这些结构化对象；查询与运维规则见 [operations.md](operations.md)。

## 5. 提交前门禁

```bash
cd worker
pnpm test
./node_modules/.bin/tsc --noEmit

cd ..
pnpm build
```

阶段 5 当前验收基线：单测 **7/7**、本地集成套件覆盖文本 / 文件 / 阅后即焚（含并发 claim）/ 最大下载次数 / 管理后台（含文件 R2 删除）/ Cron 清理 / Rate Limiting 429 阈值、Worker typecheck 通过、根项目 build 通过。
