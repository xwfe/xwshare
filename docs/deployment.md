# 生产部署

当前推荐拓扑：

```text
Cloudflare Pages (Vue)
        │ HTTPS
        ▼
Cloudflare Worker (Hono)
   ├─ D1: xwshare-db
   └─ R2: xwshare-files
```

Pages 与 Worker 默认独立部署，因此生产 `VITE_WORKER_API_URL` 必须显式填写 Worker HTTPS 地址。

## 1. 创建 Cloudflare 资源

```bash
cd worker
pnpm exec wrangler login
pnpm exec wrangler d1 create xwshare-db
pnpm exec wrangler r2 bucket create xwshare-files
```

把 D1 创建结果中的真实 `database_id` 写入 `worker/wrangler.toml`。

## 2. 前端生产变量

```bash
cp .env.production.example .env.production
```

填写：

```dotenv
VITE_WORKER_API_URL=https://<worker>.workers.dev
VITE_TURNSTILE_SITE_KEY=<production-site-key>
```

`.env.production` 已被 Git 忽略。

## 3. Worker Secret

```bash
cd worker
pnpm exec wrangler secret put PICKUP_CODE_SECRET
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
pnpm exec wrangler secret put ADMIN_PASSWORD
```

要求：

- `PICKUP_CODE_SECRET` 至少 32 字符
- `ADMIN_PASSWORD` 至少 6 字符，不能使用仓库中的开发占位值
- Secret / API Token 不写入 `wrangler.toml` 或 Git

## 4. Preflight

根目录：

```bash
pnpm run preflight:production
```

检查 Node、Git origin、D1 ID、生产 Worker URL、Turnstile Site Key、Rate Limiting 和 Observability。

非交互 Cloudflare 环境先提供 `CLOUDFLARE_API_TOKEN`，再运行：

```bash
cd worker
pnpm run preflight:cloudflare
```

该检查只验证必需 Secret **名称**和 Wrangler production dry-run，不读取 Secret 值。

## 5. 初始化 D1

全新生产库：

```bash
cd worker
pnpm run db:init
```

只有已有旧结构数据库时才使用：

```bash
pnpm run db:migrate
```

## 6. 部署

Worker：

```bash
cd worker
pnpm run deploy
```

Pages：

```bash
cd ..
pnpm run deploy:pages
```

`deploy:pages` 会先执行 production preflight 和前端完整 build，并复用 `worker` 目录锁定的 Wrangler。

## 7. Smoke

生产至少验证：

- 文本寄件 / 取件
- 文件登记 / 上传 / 确认 / 下载
- 阅后即焚
- 最大取件次数
- 管理员登录 / 列表 / 删除
- Turnstile
- 两个 Rate Limiting binding
- Cron 清理
- Workers Logs

日志和查询见 [operations.md](operations.md)。

## 自定义同域

如果未来给自定义域明确配置 Worker `/api/*` route，可以让前端使用相对 `/api`。当前仓库默认没有这层 route，因此 production preflight 会拒绝空的 `VITE_WORKER_API_URL`。
