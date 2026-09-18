# 架构说明

本文只写系统**现在实际怎么工作**，以及和宣传不符的地方。怎么跑见 [README.md](README.md)，下一步做什么见 [docs/roadmap.md](docs/roadmap.md)。

---

## 1. 现在只打 Worker

```text
浏览器 (Vue 3, Hash 路由)
  │
  ├─ 寄件 / 取件 ──► Cloudflare Worker (:8787 或同域 /api)
  └─ 管理后台   ──► 同上 Worker 的 /api/admin/* 、/api/config
                         ├─ D1  parcels 表（元数据、短文本、状态）
                         └─ R2  文件对象（经 Worker 中转，不是 R2 预签名直传）
```

寄取件只走 `src/services/parcel.ts`（`fetch`）。`VITE_WORKER_API_URL` 为空时用相对路径 `/api`，开发环境由 Vite 反代到 8787。

Worker 挂了就报错，**不会**再回退到旧 API。寄取件和管理后台最小集都打 Worker。旧 axios 请求客户端和未使用的 multipart 辅助代码已经删除。

---

## 2. Parcel（快递件）

业务实体不再叫“分享链接”，统一叫 Parcel。D1 表定义在 `worker/src/db/schema.sql`。

| 字段 | 实际含义 |
| --- | --- |
| `id` | UUID |
| `pickup_code_hash` | 取件码的 HMAC-SHA256，库里没有明文取件码 |
| `type` | `text` / `markdown` / `file`。前端寄件目前只传 `text`，`markdown` 是预留 |
| `content` | 短文本，直接进 D1 |
| `file_key` | R2 对象键，格式 `files/{id}/{filename}` |
| `expires_at` | 过期时间。Worker 只认 `1h` / `1d` / `7d`，其它值按 1 天 |
| `burn_after_read` | 阅后即焚 |
| `max_downloads` | `0` = 不限制 |
| `encrypted` | 客户端是否已加密，服务端不当密钥用 |
| `status` | `PENDING`（文件未传完）→ `AVAILABLE` → 阅后即焚时 `CLAIMED` → 过期清理 `DELETED` |
| `ip_hash` | 创建者 IP 的 HMAC，库里看不到原始 IP |
| `upload_token_hash` | 文件上传一次性凭证的 HMAC，确认后清空 |
| `storage_provider` | 默认 `r2`，没有第二套实现 |

---

## 3. 状态机

实际状态：`PENDING` → `AVAILABLE` → `CLAIMED` → `DELETED`。没有 `CONSUMED`。

- 文本新建就是 `AVAILABLE`
- 文件新建是 `PENDING`，`confirm-upload` 确认 R2 里真有对象后才改成 `AVAILABLE`
- 取件时如果还是 `PENDING`，返回 403 `NOT_READY`
- 阅后即焚取件成功：`AVAILABLE → CLAIMED`
- 定时任务每 15 分钟扫过期记录：删 R2，标 `DELETED`，清空 `content` / `file_key`

并发取件：阅后即焚用 `UPDATE ... WHERE status='AVAILABLE'` 做 CAS。非阅后即焚只加 `download_count`。

---

## 4. 寄件 / 取件数据流

### 文本

1. 可选：浏览器 `crypto.subtle` 生成 AES-256-GCM 密钥，加密正文
2. `POST /api/parcels`（Turnstile + 内存限速）
3. Worker 生成 6 位取件码，哈希入库，把**明文取件码**返回给寄件人（只此一次）
4. 分享链接：`https://example.com/#/?code=AB3K7M`，加密时再拼 `&key=...`

### 文件

1. `POST /api/parcels/upload` 拿到 `uploadUrl`、`uploadToken`，记录为 `PENDING`
2. 浏览器 `PUT`，请求头带 `x-upload-token`。没有凭证或状态不是 `PENDING` 会 401/403
3. `POST /api/parcels/confirm-upload`：R2 里有对象才把状态改成 `AVAILABLE`，空转返回 409

文件**经过 Worker**，不是客户端直传 R2。请求体上限 100MB。

### 取件

1. `POST /api/pickup` `{ code }`
2. 校验哈希、状态（`PENDING` 不能取）、过期、次数
3. 文本把 `content` 放进 JSON；文件返回带签名 `token` 的下载地址，15 分钟失效
4. 加密文本由浏览器解密；缺 `key` 时提示用完整链接

`GET /api/download-file/:fileKey` 没有有效 `token` 会 403。`token` 用取件码对应的密钥签，不是把取件码再传一遍。

---

## 5. 安全模型（已落地 / 还是空的）

已落地：

- 取件码、上传凭证、创建者 IP 都只存 HMAC。生产缺 `PICKUP_CODE_SECRET` 会 500，不会再用 `'secret'`
- 文件 `PENDING` 不能取；上传 / 下载都要一次性凭证
- E2E 密钥只在 URL Hash 里，服务端只存密文
- 寄件接口：Turnstile 生产 fail-closed；开发环境 `ENVIRONMENT=development` 可跳过
- 阅后即焚的 Claim 是原子更新
- 管理员口令在 Worker Secret 里。登录签发 HMAC token（24 小时）；没带或过期的 `/api/admin/*` 返回 401

还弱的：

| 说法 | 实际 |
| --- | --- |
| 边缘限速 | Cloudflare Rate Limiting binding，同一来源 IP 每分钟 10 次；计数按 Cloudflare location 生效且最终一致，不用于精确计费 |
| 上传走预签名、不占 Worker | 上传仍走 Worker 代理，只是多了上传凭证 |

---

## 6. 前端分层

`pnpm build` 会跑 `scripts/check-architecture.mjs`，分层是硬约束。

| 层 | 目录 | 允许做什么 |
| --- | --- | --- |
| 页面 | `src/views/` | 排版、组合组件、跳路由。禁止 `fetch` / 调 Service |
| 组件 | `src/components/` | props 进、emit 出 |
| 流程 | `src/composables/` | 寄件、取件、登录等完整生命周期 |
| 网关 | `src/services/` | 唯一发请求的地方 |
| 工具 | `src/utils/` | 无请求副作用的纯函数（加解密、拼链接） |
| 状态 | `src/stores/` | 跨页状态（提醒、本地寄件记录、配置缓存） |

路由是 Hash History，所以分享链接必须是 `/#/?code=...`，不能写成 `/share/xxx`。

`/#/admin` 要登录。公开配置来自 `GET /api/config`。仪表盘和快递列表打 `/api/admin/stats`、`/api/admin/parcels`。

---

## 7. Worker 内部

入口 `worker/src/index.ts`：挂 CORS、Parcel 路由、Admin 路由、健康检查 `GET /`、Cron。

存储接口 `StorageProvider` 预留了换 MinIO / S3 的位置，当前只有 `R2Storage`，且上传 / 下载 URL 都指回本 Worker。

Cron：`*/15 * * * *`，逻辑在 `worker/src/cron/cleanup.ts`。只处理 `expires_at` 已过且状态不是 `DELETED` 的行。`CLAIMED` 但未过期的阅后即焚记录会一直留到过期。

---

## 8. 回归与可观测性

Worker 使用 Node 自带 `node:test`，没有再引入测试框架依赖。当前两层：

1. 单测：取件码字符集与归一化、生产 Secret fail-closed、HMAC、管理员 token、下载 token；
2. 集成：真实 Wrangler + 独立本地 D1/R2，验证文本寄取件、文件上传/确认/下载、阅后即焚和管理后台主路径。

`cd worker && pnpm test` 一次跑完。集成测试使用独立 `.test-state-*`，结束后清理，不复用开发库。

Worker 关键事件通过 `worker/src/utils/log.ts` 输出单行 JSON，事件名固定，日志不带取件码、Secret、正文、上传 token 或原始 IP。已覆盖寄件成功、取件成功/拒绝、Turnstile 拒绝/配置错误、限速、未捕获错误、过期清理结果。

本地回归已覆盖管理员删除文件时的 R2 联动和 Rate Limiting binding 的 10/分钟阈值；Turnstile 真实远端校验按设计不进入本地稳定套件。
