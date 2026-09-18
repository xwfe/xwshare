# ⚡ Drop Worker - Cloudflare Workers 后端

基于 **Hono** 构建的高性能 Cloudflare Worker 边缘服务，整合 D1 数据库与 R2 对象存储。

## 目录结构

```text
src/
├── cron/
│   └── cleanup.ts          # 定时任务：自动清理过期及标记为 DELETED 的快递
├── db/
│   └── schema.sql          # D1 数据库表结构与索引定义
├── middleware/
│   ├── cors.ts             # CORS 跨域配置中间件
│   ├── rate-limit.ts       # 内存级 IP 访问频率限制
│   └── turnstile.ts        # Cloudflare Turnstile 人机验证中间件
├── routes/
│   └── parcel.ts           # 核心 API 路由（寄件、取件、直传代理、下载）
├── storage/
│   ├── provider.ts         # StorageProvider 抽象存储接口
│   └── r2.ts               # R2 存储驱动实现
├── types/
│   └── env.ts              # Worker 环境变量与 Bindings 类型声明
├── utils/
│   └── pickup-code.ts      # 6 位取件码随机生成与 HMAC-SHA256 哈希
└── index.ts                # Hono 应用主入口与 Cron Trigger 挂载
```

## 本地调试

```bash
# 安装依赖
pnpm install

# 启动本地 Wrangler 开发服务 (监听 8787 端口)
pnpm dev

# 执行 TypeScript 类型检查
pnpm run typecheck
```

## 部署流程

```bash
# 1. 登录 Cloudflare
pnpm dlx wrangler login

# 2. 创建 D1 数据库并执行初始化 SQL
pnpm dlx wrangler d1 create drop-db
pnpm dlx wrangler d1 execute drop-db --file=src/db/schema.sql

# 3. 创建 R2 存储桶
pnpm dlx wrangler r2 bucket create drop-files

# 4. 设置安全密钥
pnpm dlx wrangler secret put PICKUP_CODE_SECRET
pnpm dlx wrangler secret put TURNSTILE_SECRET_KEY

# 5. 发布部署
pnpm run deploy
```
