# 后续计划

更新日期：2026-09-11

这份文件是后续工作的唯一计划入口。怎么跑见 [README.md](../README.md)，现状怎么工作见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

---

## 主要矛盾

寄取件和管理后台最小集都打 Worker，旧 Python 进程可以从运行时关掉。仓库里还留着 `FileService` / axios 和旧后台大页，主路径不再调用。

次要问题（最多盯这两件，别平行铺开）：

1. 名字三套并行：仓库和 Worker 叫 xshare，界面叫 FileCodeBox，PWA 叫 Drop
2. 没有测试，也没有生产可观测性

---

## 现在不要做的事

- 不要再加「回退到旧 API」的兼容分支，除非旧后端是明确的部署选项
- 不要在 Worker 里复刻旧后台全部能力（视图预设、批量策略、分片秒传）后再谈独立部署
- 不要把存储抽象扩到 MinIO / WebDAV，R2 代理上传已经够用
- 不要在文档里继续写「PWA 可离线」「预签名直传 R2」——代码里没有

---

## 阶段 0：已经落地（不要重做）

- Worker：寄文本、登记+代理上传文件、取件、Cron 清理过期数据
- 前端寄取件优先打 Worker；加密开启时禁止回退旧 API
- Turnstile 生产 fail-closed
- 取件码 HMAC、可选 E2E、阅后即焚 CAS
- 前端分层检查（`pnpm build` 会跑）
- 中 / 英 i18n、主题切换、本地寄件记录

---

## 阶段 1：前端 + Worker 能独立寄取件

目标：关掉 `VITE_API_BASE_URL_*`、不启动 Python，寄件、取件、分享链接仍完整可用。管理后台可以暂时入口隐藏或显示「尚未接入」。

作为使用者，我希望只部署 Pages + Worker 就能收发快递，以便不再维持一套 Python 服务。

验收：

- [x] AC-1 当旧后端不可达时，打开首页不应因为公开配置请求失败而打断寄取件。
- [x] AC-2 当用户输入 6 位取件码时，预览或取件只打 Worker；旧 `/share/metadata`、`/share/select` 不再出现在主路径。
- [x] AC-3 如果 Worker 寄件失败，系统应报错，不再自动回退 `/share/file/`、`/share/text/`、分片上传。
- [x] AC-4 复制的 wget / 直链指向当前取件页或 Worker 下载地址，而不是 `/share/select`。
- [x] AC-5 验证：只起前端 + Worker，寄文本、寄文件、取件、阅后即焚都打 `/api/parcels*` 和 `/api/pickup`，Network 里没有 `localhost:12345`。加密寄件代码路径已去掉旧回退，本次浏览器未单独点加密开关。

建议顺序：先让公开配置失败变静默（半小时级），再把取件预览并进 Worker 或删掉预览，最后拆掉寄取件 fallback。

---

## 阶段 2：上传状态和下载凭证

目标：不知道取件码的人，不能靠猜 URL 上传或下载。

作为收件人，我希望只有拿出取件码才能拿到文件；作为系统，我希望没传完的文件不能被取走。

验收：

- [x] AC-1 当文件记录刚创建、上传未确认时，系统应拒绝取件。
- [x] AC-2 如果有人 `PUT /api/upload/:fileKey` 却没有对应的一次性上传凭证，系统应返回 401/403。
- [x] AC-3 如果有人只拿着 `fileKey` 访问 `/api/download-file/...`，系统应拒绝；下载必须先通过取件。
- [x] AC-4 `confirm-upload` 必须把状态从「待上传」改成 `AVAILABLE`，空转视为失败。
- [x] AC-5 生产未配置 `PICKUP_CODE_SECRET` 时 Worker 应拒绝写库，不得再用 `'secret'`。
- [x] AC-6 `ip_hash` 存的是哈希。验证：读 D1 一行，看不到原始 IP。

`CONSUMED` 已从 schema 和类型里删掉。已有库跑 `pnpm run db:migrate:local`（生产 `db:migrate`）。

---

## 阶段 3：管理后台最小集迁到 Worker

目标：旧 Python 进程可以关。只做最小集，不搬运旧后台所有边角。

作为运营者，我希望在 `/#/admin` 看到未过期快递、删掉滥用内容、看今天寄了多少件。

验收：

- [x] AC-1 当管理员用配置的口令登录时，系统应签发短时 token，过期后后台接口 401。
- [x] AC-2 文件列表来自 D1 `parcels`，能按状态筛选，能删除（同时删 R2）。
- [x] AC-3 仪表盘数字来自 D1 聚合，不再请求 `/admin/dashboard`。
- [x] AC-4 未带 token 访问 `/api/admin/stats`、`/api/admin/parcels` 返回 401；未登录打开 `/#/admin` 进登录页。
- [x] AC-5 公开配置（站点名、最大体积、Turnstile 是否启用）从 Worker `GET /api/config` 读。

明确不做：视图预设、批量策略动作、分片秒传、旧预签名上传、系统设置页。

本地口令见 [README.md](../README.md)。验证：浏览器登录、仪表盘数字来自 D1、列表筛选 CLAIMED、删除后列表变空；Network 只有 `/api/admin/*` 和 `/api/config`，没有 `localhost:12345`。

---

## 阶段 4：名字、许可、名实相符

- 界面、`package.json`、`manifest.json`、控制台 banner 统一为 xshare
- 补 LICENSE（若仍用 MIT，就把文件加进仓库；README 不要再空口写 MIT）
- 有 Service Worker 再写 PWA；否则把 manifest 当「可添加到主屏」即可，文档已按这个口径写
- D1 / R2 名称从 `drop-*` 改成 `xshare-*` 可以另开，要同步 wrangler 和 `db:init` 脚本

---

## 阶段 5：能回归、能看见失败

- Worker 路由和取件码哈希补单测；寄取件补一条最小集成（本地 D1）
- 限速换 Cloudflare 自带 Rate Limiting 或 Durable Object，丢掉进程内 `Map`
- 结构化日志：寄件、取件失败、Turnstile 拒绝、清理条数
- wrangler / workers-types 从 2024 年的版本往前升一档，单独做，不和功能混在一个 PR

---

## 建议的下一轮

阶段 3 已落地。下一轮做阶段 4：界面、`package.json`、manifest、控制台 banner 统一叫 xshare，并补 LICENSE。
