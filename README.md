# xwshare

匿名文件 / 文本快递柜：寄件后生成 **6 位取件码**，收件人凭取件码或分享链接取件。

> Anonymous file and text drop box powered by Cloudflare Workers, D1 and R2.

xwshare 基于 **Vue 3 + Cloudflare Worker（Hono）+ D1 + R2**，无需旧 Python 后端。

## 适合场景

- 临时分享文件或文本，不想创建账号
- 手机、电脑之间快速传内容，作为轻量在线剪贴板
- 需要限时、限次数或阅后即焚的临时传输
- 需要可选端到端加密的匿名分享

## 核心能力

- 6 位无歧义取件码；有效期支持 1 小时 / 1 天 / 7 天
- 文件最大 100 MiB，文本最大 1 MiB
- 可选 AES-256-GCM 端到端加密、阅后即焚、最大取件次数
- Turnstile、Cloudflare Rate Limiting、管理员后台、Cron 清理和 Workers Logs

## 快速使用

需要 **Node.js 22+**、**pnpm 11+**。

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

提交前统一验证：

```bash
pnpm run ci:verify
```

## 生产部署

推荐使用 **Cloudflare Pages + Worker + D1 + R2**。生产前需要准备 D1 / R2、前端生产变量和 Worker Secret。

完整初始化、preflight、部署和 smoke 流程见 [docs/deployment.md](docs/deployment.md)。

## 注意

- 当前文件上传经过 Worker 中转，不是 R2 预签名直传。
- E2E 加密密钥只存在分享链接的 URL Hash 中；丢失完整链接后服务端无法恢复密钥。
- Secret、Cloudflare API Token 和 `.env.production` 不要提交到 Git。
- 这是临时快递柜，不是长期文件存储；过期内容由 Cron 清理。

## 文档

- [开发与测试](docs/development.md)
- [生产部署](docs/deployment.md)
- [架构与安全模型](docs/architecture.md)
- [测试边界](docs/testing.md)
- [生产运维](docs/operations.md)
- [后续计划](docs/roadmap.md)
- [Worker API](worker/README.md)

## Credits

前端界面与交互的大部分设计 / 实现来自 [vastsa/FileCodeBoxFronted](https://github.com/vastsa/FileCodeBoxFronted)。

## License

[GPL-3.0](LICENSE)
