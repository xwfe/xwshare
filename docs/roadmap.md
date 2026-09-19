# 后续计划

更新日期：2026-09-19

这份文件是后续工作的唯一计划入口。怎么跑见 [development.md](development.md)，现状怎么工作见 [architecture.md](architecture.md)。

---

## 主要矛盾

寄取件和管理后台最小集都打 Worker，旧后端已经退出运行时；阶段 4 已完成品牌、许可和死代码清理。

当前主要缺口：

1. 自动回归已覆盖主要 Worker 业务与安全状态机；Turnstile 真实远端校验不放进本地稳定套件
2. 仓库侧 Workers Logs 已接入；外部告警投递仍需在具体 Cloudflare / 监控账户配置

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

- [x] 界面、包名、manifest、Worker 服务名、控制台 banner 统一为 xwshare
- [x] 补 GPL-3.0 LICENSE
- [x] 删除未实际使用的 Service Worker，manifest 只承担可安装元数据
- [x] D1 / R2 默认名统一为 `xwshare-db` / `xwshare-files`
- [x] 删除旧 axios 请求客户端、multipart helper 和无用依赖

---

## 阶段 5：能回归、能看见失败

- [x] 取件码 / HMAC / 管理员与下载 token 补单测（当前 7 条）
- [x] 寄取件补一条真实 Wrangler + 本地 D1 最小集成：寄文本 → 规范化取件码 → 取回
- [x] 结构化日志：寄件、取件拒绝/成功、Turnstile、限速、未捕获错误、清理结果
- [x] 补文件上传、阅后即焚、管理后台关键路径集成回归
- [x] 补并发阅后即焚、最大下载次数、Cron 清理回归
- [x] 限速换 Cloudflare Rate Limiting binding，丢掉进程内 `Map`
- [x] 开启 Cloudflare Workers Logs，结构化字段可直接查询，并补生产监控 runbook
- [x] 明确外部告警 / OTLP / Logpush 为账户级部署动作，不把凭据或目标地址写入仓库
- [x] Wrangler 升到 4.130.0、Workers Types 升到 5.20260908.1，并保持独立维护提交

---

## 建议的下一轮

阶段 5 的仓库侧工作已完成：自动回归、结构化日志、Workers Logs、Wrangler 维护升级、Rate Limiting 都已落地。下一轮进入生产部署复验；外部告警投递按实际 Cloudflare 账户和监控系统执行，不作为代码阶段阻塞项。

---

## 阶段 6：生产部署复验

- [x] 增加本地 production preflight，阻止 D1 占位 ID / 空 Turnstile Site Key 进入部署
- [x] 增加 Cloudflare 远端 preflight，只核对必需 Secret 名称和 production dry-run
- [x] 修正 Pages → Worker 跨域生产路径：CORS 允许管理 `DELETE`，Pages 部署复用锁定 Wrangler
- [x] 管理员登录增加独立 5 次/分钟/IP 的 Cloudflare Rate Limiting，避免公网暴力尝试
- [x] 删除未使用的 Wrangler named development environment，本地/生产配置边界唯一化
- [x] 生产环境变量改为本地忽略文件 + tracked example，Pages deploy 强制先过 production preflight
- [x] 固化仓库级 `ci:verify`：前端 build + Worker typecheck + Worker test；Worker pin pnpm 11.20.0
- [x] 修正旧 GitHub Actions 两个运行错误：pnpm 双版本声明冲突、pnpm 9 workspace 缺少 `packages`
- [x] 上线前输入边界加固：Worker 强制文件/文本大小、有效期/类型校验，上传 token 原子单次 claim，上传实际尺寸一致
- [x] `maxDownloads` 改为 D1 原子条件扣减，防止并发取件越过次数上限
- [ ] 更新受保护 GitHub workflow：Node 22 / pnpm 11，并改为执行完整 `ci:verify`（当前工具无 workflow 写权限）
- [x] GitHub `xwfe/xwshare` remote 已可访问并建立 `main`
- [x] 首次推送本地 `main` 到 `xwfe/xwshare`，并建立 upstream
- [ ] 填入真实 D1 `database_id`
- [ ] 填入生产 `VITE_WORKER_API_URL`（当前 Pages + Worker 独立部署必须显式指向 Worker HTTPS 地址）
- [ ] 填入生产 `VITE_TURNSTILE_SITE_KEY`
- [ ] 非交互环境提供 `CLOUDFLARE_API_TOKEN`，远端 preflight 通过
- [ ] 初始化 / 迁移生产 D1，部署 Worker 和 Pages
- [ ] 生产 smoke：文本、文件、阅后即焚、管理后台、Rate Limiting、Workers Logs

当前外部阻塞：gld 仍把 `.github/workflows/*` 视为 protected asset，无法在本会话更新旧 Node 20 / pnpm 9 workflow；Wrangler 非交互环境也没有 `CLOUDFLARE_API_TOKEN`。GitHub remote 与 `main` 已正常建立。
