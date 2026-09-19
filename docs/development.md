# 开发与测试

本文记录 xwshare 的本地开发、数据库初始化和统一验证入口。生产部署见 [deployment.md](deployment.md)。

## 环境

- Node.js 22+
- pnpm 11+，当前本地验证使用 11.20.0
- Worker 使用 Wrangler 4.x

安装两套依赖：

```bash
pnpm install
pnpm --dir worker install
```

## 本地数据库

第一次运行：

```bash
pnpm --dir worker run db:init:local
```

只有从旧表结构升级时才运行：

```bash
pnpm --dir worker run db:migrate:local
```

新库不要再跑 migration。

## 启动

终端 1：

```bash
pnpm --dir worker dev
```

终端 2：

```bash
pnpm dev
```

- 前端：`http://localhost:5173`
- Worker：`http://127.0.0.1:8787`
- Vite 把本地 `/api` 代理到 8787
- 本地管理员口令：`xwshare-dev`
- development 模式跳过服务端 Turnstile 校验；前端使用 Cloudflare 官方测试 Site Key

`worker/.wrangler/` 是日常本地状态；集成测试使用独立 `.test-state-*`，不会污染开发库。

## 验证

Worker：

```bash
pnpm --dir worker run typecheck
pnpm --dir worker test
```

仓库统一门禁：

```bash
pnpm run ci:verify
```

`ci:verify` 依次执行：

1. 前端架构检查、Vue typecheck、production build
2. Worker TypeScript typecheck
3. Worker 单测与真实本地 D1 / R2 集成测试

详细覆盖范围见 [testing.md](testing.md)，分层和安全边界见 [architecture.md](architecture.md)。

## GitHub Actions

当前远端 workflow 仍是历史的 frontend-only 构建。此前两个错误已经在本地复现并修正：

1. workflow 显式安装 `pnpm 9.15.9`，同时根 `package.json` 又声明 `pnpm@11.20.0`；pnpm action 会把双版本声明直接判为配置错误。根包已移除精确 `packageManager` pin，Worker 仍固定 `pnpm@11.20.0`。
2. pnpm 9 读取只有 `allowBuilds` 的 `pnpm-workspace.yaml` 时会报 `packages field missing or empty`。根目录与 Worker 的 workspace manifest 现在都显式声明 `packages: ['.']`。

修正后已用 `pnpm 9.15.9 install --frozen-lockfile` + `pnpm 9.15.9 run build` 本地完整复现旧 workflow 路径，两个步骤均通过。

完整仓库门禁仍以本地 `pnpm run ci:verify` 为准，后续应把 GitHub workflow 正式升级为 Node 22 / pnpm 11 并执行同一入口。
