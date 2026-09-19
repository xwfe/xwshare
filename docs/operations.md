# 生产可观测性与运维

本文记录 xwshare Worker 的生产日志、查询和外部告警接入边界。测试覆盖见 [testing.md](testing.md)，系统设计见 [../ARCHITECTURE.md](../ARCHITECTURE.md)。

## 1. Workers Logs

`worker/wrangler.toml` 已开启 Workers Logs：

```toml
[observability]
enabled = true

  [observability.logs]
  invocation_logs = true
  head_sampling_rate = 1
```

当前保留 100% 日志，适合 dogfood 和早期生产。流量明显增大后可以下调日志采样率，但低采样率会降低稀有错误的可见性。

这里只启用 logs，不启用 traces。结构化业务事件来自 `worker/src/utils/log.ts`，直接向 `console.info/warn/error` 输出对象，Cloudflare 可以提取并索引 `event`、`reason`、`parcelId` 等字段。

## 2. 部署后检查

部署前：

```bash
pnpm run preflight:production

cd worker
pnpm test
./node_modules/.bin/tsc --noEmit
pnpm run preflight:cloudflare

cd ..
pnpm build
pnpm run deploy:pages
```

`preflight:production` 只做本地静态检查：Node 版本、Git origin、D1 `database_id`、生产 Worker HTTPS 地址、Turnstile Site Key、Rate Limiting / Observability 配置。

当前生产拓扑是 **Pages + Worker 独立部署**。先复制 `.env.production.example` 为本地 `.env.production`。真实文件被 Git 忽略，避免不同部署环境的 Worker URL / Turnstile Site Key 污染仓库。

`.env.production` 的 `VITE_WORKER_API_URL` 必须填写 Worker HTTPS 地址；空值只适用于已经额外配置了自定义域 `/api/*` Worker route 的部署，而仓库默认没有这层 route。

Pages 部署统一通过根目录 `pnpm run deploy:pages`。它会先执行 production preflight + build，再复用 `worker` 中锁定的 Wrangler；不要再用 `npx wrangler pages deploy` 临时拉取版本。

`preflight:cloudflare` 会通过 Wrangler 读取生产 Worker 的 Secret **名称**，确认 `PICKUP_CODE_SECRET`、`TURNSTILE_SECRET_KEY`、`ADMIN_PASSWORD` 都存在，再跑 production dry-run。它不会读取 Secret 值。非交互环境需要 `CLOUDFLARE_API_TOKEN`。

Wrangler 不再维护单独的 `development` environment。本地开发统一由 `pnpm dev` 注入 `ENVIRONMENT=development`，生产始终使用顶层配置，避免 deploy / secret / D1 命令出现环境选择歧义。

部署后在 Cloudflare Dashboard 打开：

`Workers & Pages → xwshare-worker → Observability`

先确认三件事：

1. 普通请求能看到 invocation log；
2. 寄件 / 取件后能看到 `parcel.*` 结构化事件；
3. 人为触发一次不存在的取件码，能按 `event = "parcel.pickup.rejected"` 找到事件。

实时排查可以使用：

```bash
cd worker
pnpm exec wrangler tail
```

实时日志适合部署后即时验证；长期查询使用 Workers Logs。

## CI 门禁

仓库已经提供统一入口：

```bash
pnpm run ci:verify
```

它按顺序执行前端 `pnpm build`、Worker typecheck、Worker 完整测试。目标 CI 基线是 Node.js 22 + pnpm 11.20.0。

当前受保护的 `.github/workflows/release-please.yml` 仍使用 Node 20 + pnpm 9，并且只跑前端 build；当前 gld 工具禁止修改 `.github/workflows/*`，因此这一项必须在 GitHub / 具备 workflow 写权限的环境中修正。

2026-09-19 已完成 `xwfe/xwshare` 首次 `main` 推送，并建立本地 `main -> origin/main` upstream。首次推送前本地仓库是 shallow clone；从原始上游 `vastsa/FileCodeBoxFronted` 补全历史后，Git 对象完整性检查通过并成功推送。后续正常 `git push` 不再需要这一步。

## 3. 建议保存的查询

Workers Observability Query Builder 支持直接按结构化字段过滤，并可把常用查询保存到账户级。

### 关键错误

```text
event = "request.unhandled" OR event = "turnstile.misconfigured" OR event = "cleanup.expired.failed"
```

任何命中都应优先检查。

### Worker 5xx

```text
$workers.event.response.status >= 500
```

用于发现没有被业务事件覆盖的 5xx。

### 限速 / 滥用

```text
event = "request.rate_limited"
```

观察数量和时间分布，并按 `scope` 区分 `parcel` 与 `admin_login`。当前 limiter key 是来源 IP；共享 NAT / 移动网络可能让多人共享额度，因此不能仅凭此事件判断恶意用户。

### 取件失败

```text
event = "parcel.pickup.rejected"
```

在 Query Builder 中按 `reason` 分组，重点看：

- `not_found`：大量出现可能是扫描 / 猜码；
- `not_ready`：可能是上传确认流程异常；
- `expired` / `max_downloads` / `unavailable`：通常是正常业务拒绝。

### Cron

```text
event = "cleanup.expired.completed" OR event = "cleanup.expired.failed"
```

正常情况下每 15 分钟应有 scheduled invocation；只有确实找到过期记录时才会产生 `cleanup.expired.completed` 业务事件。

## 4. 外部告警

仓库不保存 Cloudflare API Token、OTLP endpoint、Sentry / Grafana / Axiom 等第三方凭据。

需要自动告警时，优先使用 Cloudflare 的 OpenTelemetry export 接入已有监控系统，再由目标系统建立通知规则。若账户使用 Workers Paid，也可以选 Workers Logpush；新接入不默认选择 Logpush。

建议最少建立三类通知：

1. `request.unhandled` / `turnstile.misconfigured` / `cleanup.expired.failed` 出现即告警；
2. Worker 5xx 在短窗口持续出现时告警；
3. `request.rate_limited` 明显偏离基线时告警。

这些是账户级部署动作：只有确定实际 Cloudflare account、目标监控系统和通知渠道后再配置，不作为仓库代码完成度的阻塞项。

## 5. 日志安全边界

业务日志禁止包含：

- 明文取件码；
- `PICKUP_CODE_SECRET` / Turnstile Secret / 管理员口令；
- 上传 token、下载 token；
- 文本正文、文件内容；
- 原始 IP。

新增日志字段时先判断它是否能直接识别用户或重建访问凭证。能的话不要写入日志。
