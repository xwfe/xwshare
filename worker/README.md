# xwshare Worker

寄件 / 取件 / 管理后台 API。Hono 跑在 Cloudflare Workers 上，短文本进 D1，文件经本进程写入 R2。

本地联调见 [docs/development.md](../docs/development.md)，生产部署见 [docs/deployment.md](../docs/deployment.md)，架构和安全边界见 [docs/architecture.md](../docs/architecture.md)。

---

## 目录

```text
src/
├── cron/cleanup.ts           # 每 15 分钟：过期记录删 R2、标 DELETED
├── db/schema.sql             # D1 表和索引
├── middleware/
│   ├── admin-auth.ts         # /api/admin/* 校验 Bearer token
│   ├── cors.ts               # 目前 origin: *
│   ├── rate-limit.ts         # Cloudflare Rate Limiting binding，每分钟 10 次
│   └── turnstile.ts          # 生产缺 Secret 直接 500
├── routes/
│   ├── admin.ts              # 公开配置、登录、统计、快递列表/删除
│   └── parcel.ts             # 寄件、上传、取件、下载
├── storage/
│   ├── provider.ts           # 存储接口（只有 R2 实现）
│   └── r2.ts                 # 上传/下载 URL 指回本 Worker
├── types/env.ts
├── config/limits.ts          # Worker 强制的文件/文本/字段大小边界
├── utils/
│   ├── pickup-code.ts        # 6 位取件码
│   ├── parcel-input.ts       # 请求体类型/大小/有效期校验
│   └── secret.ts             # HMAC、上传/下载凭证、管理员口令
└── index.ts
```

---

## 本地

需要 Node.js 22+。当前 Wrangler 版本线为 4.x。

```bash
pnpm install
pnpm run db:init:local    # 只第一次。不跑的话寄件报 D1 表不存在
pnpm run db:migrate:local # 已有旧表时升级 PENDING / upload_token_hash。新库不要跑
pnpm dev                  # 127.0.0.1:8787
pnpm run typecheck
pnpm test
```

`pnpm dev` 会带 `--var ENVIRONMENT:development` 和本地管理员口令。Wrangler 不再定义额外的 named development environment；本地统一走这个脚本，生产统一走顶层配置。只跑 `wrangler dev`、不带 `ENVIRONMENT` 时，没配 `TURNSTILE_SECRET_KEY` 会直接 500。`PICKUP_CODE_SECRET` 没配时，只有 development 才允许兜底，生产会 500。本地后台口令写在仓库根目录 [README.md](../README.md)。

`pnpm test` 先跑取件码 / HMAC / token 单测，再用独立 `.test-state-*` 启动真实 Wrangler + 本地 D1/R2，验证文本、文件、阅后即焚和管理后台主路径。详细边界见 [docs/testing.md](../docs/testing.md)。

---

## 生产

```bash
pnpm exec wrangler login

pnpm exec wrangler d1 create xwshare-db
# 把输出的 database_id 填进 wrangler.toml

pnpm run db:init
# 这是 --remote。漏了这步，生产库是空的，寄件 500

pnpm exec wrangler r2 bucket create xwshare-files

pnpm exec wrangler secret put PICKUP_CODE_SECRET
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
pnpm exec wrangler secret put ADMIN_PASSWORD
# Turnstile 生产必填，否则寄件 500，错误码 SERVER_MISCONFIGURED
# 管理员口令生产必填，否则后台登录 500

pnpm run preflight:cloudflare
# 非交互环境需要 CLOUDFLARE_API_TOKEN；只检查 Secret 名称和 production dry-run

pnpm run deploy
```

D1 库名、R2 桶名是 `xwshare-db` / `xwshare-files`，与 wrangler 绑定和 `package.json` 的 `db:init*` 脚本保持一致。

---

## 环境变量

| 变量 | 说明 | 必填 |
| --- | --- | --- |
| `PICKUP_CODE_SECRET` | 取件码 / 上传凭证 / IP 哈希 / 管理员 token 密钥 | 生产必填且至少 32 字符；缺失、占位或过短会 500；本地 development 才允许兜底 |
| `TURNSTILE_SECRET_KEY` | Turnstile 服务端密钥 | 生产必填，否则寄件 500 |
| `ADMIN_PASSWORD` | 后台登录口令，至少 6 位 | 生产必填，否则登录 500；本地口令见根 README |
| `ENVIRONMENT` | `development` 时跳过 Turnstile，并允许密钥兜底 | 仅本地 |

绑定（`wrangler.toml`，不是 Secret）：`DB`（D1）、`BUCKET`（R2）。

---

## API

前缀都是 `/api`。成功体是 `{ data: ... }`，失败是 `{ error, code }`。

| 方法 | 路径 | 人机验证 | 作用 |
| --- | --- | --- | --- |
| POST | `/api/parcels` | 要 | 寄文本。body：`type=text\|markdown`、`content`、`expiresIn`、`burnAfterRead`、`maxDownloads`、`encrypted` |
| POST | `/api/parcels/upload` | 要 | 登记文件快递为 `PENDING`，返回 `code` + `uploadUrl` + `uploadToken` |
| PUT | `/api/upload/:fileKey` | 无 | 写入 R2。必须带一次性 `x-upload-token`；成功 PUT 后 token 立即失效，并校验实际上传尺寸 |
| POST | `/api/parcels/confirm-upload` | 无 | R2 有对象才把 `PENDING` 改成 `AVAILABLE`，空转 409 |
| POST | `/api/pickup` | 无 | 取件。`PENDING` 返回 403 `NOT_READY` |
| GET | `/api/download-file/:fileKey` | 无 | 下文件。必须带取件时签发的 `?token=`，否则 403 |
| GET | `/api/config` | 无 | 公开配置：站点名、最大体积、Turnstile 是否启用 |
| POST | `/api/admin/login` | 无 | `{ password }`，成功返回 24 小时 Bearer token |
| GET | `/api/admin/me` | 无 | 校验当前 token |
| GET | `/api/admin/stats` | 无 | 仪表盘数字。要 `Authorization: Bearer` |
| GET | `/api/admin/parcels` | 无 | 快递列表，`status` / `limit` / `offset`。要 Bearer |
| DELETE | `/api/admin/parcels/:id` | 无 | 标 DELETED，文件同时删 R2。要 Bearer |
| GET | `/` | 无 | `{ status: 'ok', service: 'xwshare-worker' }` |

限速使用两个独立 Cloudflare Rate Limiting namespace：

- `RATE_LIMITER`：寄件和取件共享，同一来源 IP 每分钟 10 次；
- `ADMIN_RATE_LIMITER`：只保护管理员登录，同一来源 IP 每分钟 5 次。

超限统一返回 429 `RATE_LIMIT_EXCEEDED`。两个 namespace 互不消耗额度。

这是匿名服务目前能拿到的稳定来源标识，但 IP 限速会让共享 NAT / 移动网络下的多名用户共享额度。若未来增加账户或匿名设备身份，应优先把 limiter key 换成稳定用户 / 设备 ID，而不是继续依赖 IP。

`/api/admin/stats`、`/api/admin/parcels*` 没带或带错 token 返回 401 `UNAUTHORIZED`。

Worker 自己强制输入边界：

- 文件登记必须是正整数大小，最大 100 MiB；上传正文必须与登记大小一致；
- 文本 / Markdown 正文最大 1 MiB；
- `expiresIn` 只接受 `1h / 1d / 7d`；
- `maxDownloads` 只能是非负安全整数，布尔选项必须真的是 boolean；
- 取件码必须是归一化后 6 位无歧义字符；
- 生产管理员口令至少 6 位，并拒绝 `secret` / `change_me` / `xwshare-dev` 这类占位值。

上传 token 使用 D1 条件更新先原子 claim，再写 R2；并发复用同一个 token 时只能一个请求获得写入资格。写入失败会恢复原 token，成功后清空 token。

---

## 结构化日志

Worker 关键路径输出结构化对象，便于 Workers Logs 直接提取字段并检索。当前事件包括：

- `parcel.create.success`、`parcel.upload.registered`
- `parcel.pickup.success`、`parcel.pickup.rejected`
- `turnstile.rejected`、`turnstile.misconfigured`
- `request.rate_limited`、`request.unhandled`
- `cleanup.expired.completed`、`cleanup.expired.failed`

日志不记录取件码、Secret、正文、上传 token 或原始 IP。字段和验收方式见 [docs/testing.md](../docs/testing.md)。

`wrangler.toml` 已启用 Workers Logs，保留 invocation logs，日志采样率当前为 100%。结构化日志直接输出对象，因此 `event` / `reason` 等字段可在 Workers Observability 中直接过滤。生产查询和外部告警接入边界见 [docs/operations.md](../docs/operations.md)。
