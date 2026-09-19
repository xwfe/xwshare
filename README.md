# xwshare

匿名文件 / 文本快递柜：寄件后生成 **6 位取件码**，收件人输入取件码或打开分享链接即可取走。

> Anonymous file and text drop box powered by Cloudflare Workers, D1 and R2.

xwshare 使用 **Vue 3 + Cloudflare Worker（Hono）+ D1 + R2**。前后端已经统一到 Worker，不依赖旧 Python 后端。

## 核心能力

- 文本 / 文件寄取件，文件最大 100 MiB、文本最大 1 MiB
- 6 位无歧义取件码，支持 1 小时 / 1 天 / 7 天有效期
- 可选 AES-256-GCM 端到端加密、阅后即焚、最大取件次数
- Turnstile、Cloudflare Rate Limiting、HMAC 凭证与管理员后台
- Workers Logs、Cron 过期清理、D1 + R2 持久化

## 本地使用

需要 **Node.js 22+**、**pnpm 11+**；当前本地验证使用 pnpm 11.20.0。

```bash
git clone https://github.com/xwfe/xwshare.git
cd xwshare

pnpm install
pnpm --dir worker install
pnpm --dir worker run db:init:local
```

终端 1：

```bash
pnpm --dir worker dev
```

终端 2：

```bash
pnpm dev
```

前端：`http://localhost:5173`；Worker：`http://127.0.0.1:8787`。本地管理员口令为 `xwshare-dev`。

完整开发、迁移、测试与门禁说明见 [docs/development.md](docs/development.md)。

## 生产配置

当前生产基线是 **Cloudflare Pages + 独立 Worker**：

1. 创建 D1 `xwshare-db` 和 R2 `xwshare-files`，把真实 D1 `database_id` 写入 `worker/wrangler.toml`。
2. 复制 `.env.production.example` 为本地 `.env.production`，填写：
   - `VITE_WORKER_API_URL`：已部署 Worker 的 HTTPS 地址
   - `VITE_TURNSTILE_SITE_KEY`：生产 Turnstile Site Key
3. 为 Worker 设置三个 Secret：
   - `PICKUP_CODE_SECRET`：至少 32 字符
   - `TURNSTILE_SECRET_KEY`
   - `ADMIN_PASSWORD`
4. 先执行本地 / Cloudflare preflight，再部署 Worker 和 Pages。

```bash
pnpm run preflight:production

cd worker
pnpm run db:init
pnpm run preflight:cloudflare
pnpm run deploy

cd ..
pnpm run deploy:pages
```

非交互环境运行 Cloudflare preflight / deploy 时需要提供 `CLOUDFLARE_API_TOKEN`，不要提交任何 Secret 或 Token。

完整生产部署、初始化、迁移和 smoke 流程见 [docs/deployment.md](docs/deployment.md)。

## 文档

- [开发与测试](docs/development.md)
- [生产部署](docs/deployment.md)
- [架构与安全模型](docs/architecture.md)
- [测试边界](docs/testing.md)
- [生产运维与可观测性](docs/operations.md)
- [Roadmap](docs/roadmap.md)
- [Worker API / 配置](worker/README.md)

## Credits

前端界面与交互的大部分设计 / 实现来自 [vastsa/FileCodeBoxFronted](https://github.com/vastsa/FileCodeBoxFronted)。感谢原项目作者及贡献者。

xwshare 在此基础上继续重构为 Cloudflare Worker + D1 + R2 架构，并扩展安全、存储、管理与生产运维能力。

## License

[GPL-3.0](LICENSE)
