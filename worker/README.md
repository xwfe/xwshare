# xshare Worker

寄件 / 取件 / 管理后台 API。Hono 跑在 Cloudflare Workers 上，短文本进 D1，文件经本进程写入 R2。

怎么和前端一起本地联调，见仓库根目录 [README.md](../README.md)。架构和安全缺口见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

---

## 目录

```text
src/
├── cron/cleanup.ts           # 每 15 分钟：过期记录删 R2、标 DELETED
├── db/schema.sql             # D1 表和索引
├── middleware/
│   ├── admin-auth.ts         # /api/admin/* 校验 Bearer token
│   ├── cors.ts               # 目前 origin: *
│   ├── rate-limit.ts         # 进程内 IP 计数，每分钟 10 次
│   └── turnstile.ts          # 生产缺 Secret 直接 500
├── routes/
│   ├── admin.ts              # 公开配置、登录、统计、快递列表/删除
│   └── parcel.ts             # 寄件、上传、取件、下载
├── storage/
│   ├── provider.ts           # 存储接口（只有 R2 实现）
│   └── r2.ts                 # 上传/下载 URL 指回本 Worker
├── types/env.ts
├── utils/
│   ├── pickup-code.ts        # 6 位取件码
│   └── secret.ts             # HMAC、上传/下载凭证、管理员口令
└── index.ts
```

---

## 本地

```bash
pnpm install
pnpm run db:init:local    # 只第一次。不跑的话寄件报 D1 表不存在
pnpm run db:migrate:local # 已有旧表时升级 PENDING / upload_token_hash。新库不要跑
pnpm dev                  # 127.0.0.1:8787
pnpm run typecheck
```

`pnpm dev` 会带 `--var ENVIRONMENT:development` 和本地管理员口令。只跑 `wrangler dev`、不带 `ENVIRONMENT` 时，没配 `TURNSTILE_SECRET_KEY` 会直接 500。`PICKUP_CODE_SECRET` 没配时，只有 development 才允许兜底，生产会 500。本地后台口令写在仓库根目录 [README.md](../README.md)。

---

## 生产

```bash
pnpm exec wrangler login

pnpm exec wrangler d1 create drop-db
# 把输出的 database_id 填进 wrangler.toml

pnpm run db:init
# 这是 --remote。漏了这步，生产库是空的，寄件 500

pnpm exec wrangler r2 bucket create drop-files

pnpm exec wrangler secret put PICKUP_CODE_SECRET
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
pnpm exec wrangler secret put ADMIN_PASSWORD
# Turnstile 生产必填，否则寄件 500，错误码 SERVER_MISCONFIGURED
# 管理员口令生产必填，否则后台登录 500

pnpm run deploy
```

D1 库名、R2 桶名仍是 `drop-db` / `drop-files`，和 wrangler 绑定一致，改名要同步改 `package.json` 的 `db:init*` 脚本。

---

## 环境变量

| 变量 | 说明 | 必填 |
| --- | --- | --- |
| `PICKUP_CODE_SECRET` | 取件码 / 上传凭证 / IP 哈希 / 管理员 token 密钥 | 生产必填，缺了或仍是 `secret` 会 500；本地 development 才允许兜底 |
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
| PUT | `/api/upload/:fileKey` | 无 | 写入 R2。必须带 `x-upload-token`，否则 401/403 |
| POST | `/api/parcels/confirm-upload` | 无 | R2 有对象才把 `PENDING` 改成 `AVAILABLE`，空转 409 |
| POST | `/api/pickup` | 无 | 取件。`PENDING` 返回 403 `NOT_READY` |
| GET | `/api/download-file/:fileKey` | 无 | 下文件。必须带取件时签发的 `?token=`，否则 403 |
| GET | `/api/config` | 无 | 公开配置：站点名、最大体积、Turnstile 是否启用 |
| POST | `/api/admin/login` | 无 | `{ password }`，成功返回 24 小时 Bearer token |
| GET | `/api/admin/me` | 无 | 校验当前 token |
| GET | `/api/admin/stats` | 无 | 仪表盘数字。要 `Authorization: Bearer` |
| GET | `/api/admin/parcels` | 无 | 快递列表，`status` / `limit` / `offset`。要 Bearer |
| DELETE | `/api/admin/parcels/:id` | 无 | 标 DELETED，文件同时删 R2。要 Bearer |
| GET | `/` | 无 | `{ status: 'ok', service: 'xshare-worker' }` |

限速加在寄件和取件上：同一 isolate 内每 IP 每分钟 10 次，超了 429 `RATE_LIMIT_EXCEEDED`。

`/api/admin/stats`、`/api/admin/parcels*` 没带或带错 token 返回 401 `UNAUTHORIZED`。
