# xwshare

匿名文件 / 文本快递柜。寄件人拿到 **6 位取件码**（大写字母 + 数字，不含 `0/O/1/I/L`），收件人输入取件码或打开分享链接即可取走。

前端是 Vue 3，后端是 Cloudflare Worker（Hono + D1 + R2）。当前运行时已经统一为 xwshare，不依赖旧后端。

**现在只跑前端 + Worker 就能寄件、取件、进管理后台。** 后续计划见 [docs/roadmap.md](docs/roadmap.md)。

仓库：`xwfe/xwshare`。维护者 / 作者统一使用 **xwfe**。

---

## 本地怎么跑

需要：Node.js 22+、pnpm 11+。仓库固定使用 pnpm 11.20.0，Worker 当前使用 Wrangler 4.x。

```bash
git clone https://github.com/xwfe/xwshare.git
cd xwshare
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
2. 复制 `.env.production.example` 为本地 `.env.production`，填写已部署 Worker 的 HTTPS 地址（`VITE_WORKER_API_URL`）和真实 Turnstile Site Key。真实生产文件已被 Git 忽略，不把部署环境值写回仓库。
3. 在仓库根目录跑 `pnpm run preflight:production`，占位配置没清干净时直接失败。
4. 对**远程**库执行 `cd worker && pnpm run db:init`。只跑了 `db:init:local` 的话，生产寄件会报表不存在。
5. 设置三个 Secret：`PICKUP_CODE_SECRET`（自己生成一段长随机串，用来哈希取件码）、`TURNSTILE_SECRET_KEY`、`ADMIN_PASSWORD`（后台登录口令，至少 6 位）。生产没配 Turnstile Secret，所有寄件接口直接 **500**，不是静默放行。没配管理员口令，后台登录 **500**。
6. 非交互部署环境提供 `CLOUDFLARE_API_TOKEN` 后，运行 `cd worker && pnpm run preflight:cloudflare`，只核对 Secret 名称和 production dry-run。
7. `cd worker && pnpm run deploy`。
8. 回到根目录部署 Pages：

```bash
pnpm run deploy:pages
```

`deploy:pages` 会先跑 production preflight 和完整 `pnpm build`，然后使用 `worker` 目录已经锁定的 Wrangler 版本部署，不再通过 `npx` 临时下载另一个版本。

如果以后给自定义域配置了明确的 Worker `/api/*` route，可以再把 `VITE_WORKER_API_URL` 改回空值走同域；当前仓库没有这层生产 route，因此 preflight 会拒绝空值。

---

## 测试

Worker 已有轻量自动回归，不额外引入测试框架：

```bash
cd worker
pnpm test
```

当前覆盖 7 个取件码 / 密钥单测，以及使用真实 Wrangler + 独立本地 D1/R2 的集成套件：文本寄取件、文件上传/确认/下载、阅后即焚、管理员登录/统计/列表/删除。测试数据写入临时 `.test-state-*` 后自动清理，不碰日常 `.wrangler/state`。

仓库级完整门禁在根目录运行 `pnpm run ci:verify`：前端 build → Worker typecheck → Worker test。

测试边界、日志事件和扩展规则见 [docs/testing.md](docs/testing.md)。

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
- 自动回归已覆盖 Worker 安全基础、主要业务链路、并发阅后即焚、最大下载次数和 Cron 清理
- 许可证为 **GPL-3.0**，见 [LICENSE](LICENSE)

安全模型怎么工作、哪些地方还是空的，写在 [ARCHITECTURE.md](ARCHITECTURE.md)，不在这里重复。

---

## 文档怎么分工

| 文件 | 只写这件事 |
| --- | --- |
| 本 README | 怎么跑、怎么部署、当前能用什么 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系统怎么工作、安全模型、已知缺口 |
| [worker/README.md](worker/README.md) | Worker 目录、命令、环境变量、API |
| [docs/testing.md](docs/testing.md) | 自动测试、结构化日志、验收边界 |
| [docs/operations.md](docs/operations.md) | 生产日志、监控查询、告警接入边界 |
| [docs/roadmap.md](docs/roadmap.md) | 后续计划 |

`CHANGELOG.md` 留给 Release Please，现在还没打过正式版本。
