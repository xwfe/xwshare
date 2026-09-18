# xwshare

匿名文件 / 文本快递柜。寄件人拿到 **6 位取件码**（大写字母 + 数字，不含 `0/O/1/I/L`），收件人输入取件码或打开分享链接即可取走。

前端是 Vue 3，后端是 Cloudflare Worker（Hono + D1 + R2）。当前运行时已经统一为 xwshare，不依赖旧后端。

**现在只跑前端 + Worker 就能寄件、取件、进管理后台。** 后续计划见 [docs/roadmap.md](docs/roadmap.md)。

---

## 本地怎么跑

需要：Node.js 18+、pnpm 8+。

```bash
git clone https://github.com/xwfe/xshare.git
cd xshare
pnpm install
cd worker && pnpm install && cd ..
```

先起 Worker（终端 1）。**第一次**要先建本地 D1 表，不建的话寄件会报 D1 表不存在，看着像 Worker 挂了，其实是库是空的：

```bash
cd worker
pnpm run db:init:local
pnpm dev
# http://127.0.0.1:8787
```

再起前端（终端 2）：

```bash
pnpm dev
# http://localhost:5173
# Vite 已把 /api 反代到 8787，所以 .env.development 里 VITE_WORKER_API_URL 留空即可
```

浏览器打开 `http://localhost:5173`。寄文本 / 文件、取件都走 Worker。右上角盾牌 / 登录图标进后台，口令是 **`xwshare-dev`**（`pnpm dev` 已经带上 `ADMIN_PASSWORD`）。未登录打开 `/#/admin` 会跳到登录页。

如果 `pnpm run` 报 `ERR_PNPM_IGNORED_BUILDS`，不要跟那个提示去改安全策略；直接跑 `./node_modules/.bin/wrangler` / `./node_modules/.bin/vite`。

本地 Turnstile 用的是 Cloudflare 官方测试 Site Key（`1x00000000000000000000AA`，永远通过）。Worker 在 `ENVIRONMENT=development` 时也会跳过人机验证。

---

## 生产部署

详细命令在 [worker/README.md](worker/README.md)，这里只写顺序和容易踩的坑。

1. 在 Cloudflare 建 D1（库名 `xwshare-db`）和 R2（桶名 `xwshare-files`），把 `database_id` 填进 `worker/wrangler.toml`。
2. 对**远程**库执行 `pnpm run db:init`。只跑了 `db:init:local` 的话，生产寄件会报表不存在。
3. 设置三个 Secret：`PICKUP_CODE_SECRET`（自己生成一段长随机串，用来哈希取件码）、`TURNSTILE_SECRET_KEY`、`ADMIN_PASSWORD`（后台登录口令，至少 6 位）。生产没配 Turnstile Secret，所有寄件接口直接 **500**，不是静默放行。没配管理员口令，后台登录 **500**。
4. `cd worker && pnpm run deploy`。
5. 改 `.env.production`：同域部署时 `VITE_WORKER_API_URL` 留空；填上 Turnstile Site Key。然后：

```bash
pnpm build
npx wrangler pages deploy dist --project-name xwshare
```

`pnpm build` 会先跑架构分层检查（`scripts/check-architecture.mjs`）和 `vue-tsc`。检查失败时构建直接停，不会出 `dist/`。

---

## 现在有什么、没有什么

有：

- 文本 / 文件寄件，6 位取件码，过期时间只有 **1 小时 / 1 天 / 7 天** 三档
- 可选端到端加密（AES-256-GCM）。密钥在分享链接的 Hash 里：`/#/?code=AB3K7M&key=...`，浏览器不会把 `#` 后面的内容发给服务器
- 阅后即焚、最大取件次数
- 中 / 英界面、深浅色主题
- 寄件记录存在浏览器本地，刷新还在，换设备没有
- 管理后台最小集：登录、看今天寄了多少、按状态列出未删除快递、删除（文件会连 R2 一起删）

没有（别按文档里的旧说法去找）：

- **没有**旧后台那些边角：视图预设、批量策略、系统设置页、分片秒传
- **没有** Service Worker，不能离线用。`public/manifest.json` 只让浏览器显示“可安装”
- **没有**测试套件
- 许可证为 **GPL-3.0**，见 [LICENSE](LICENSE)

安全模型怎么工作、哪些地方还是空的，写在 [ARCHITECTURE.md](ARCHITECTURE.md)，不在这里重复。

---

## 文档怎么分工

| 文件 | 只写这件事 |
| --- | --- |
| 本 README | 怎么跑、怎么部署、当前能用什么 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系统怎么工作、安全模型、已知缺口 |
| [worker/README.md](worker/README.md) | Worker 目录、命令、环境变量、API |
| [docs/roadmap.md](docs/roadmap.md) | 后续计划 |

`CHANGELOG.md` 留给 Release Please，现在还没打过正式版本。
