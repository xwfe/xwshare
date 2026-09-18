# 📦 Drop - 现代化文件快递柜

> 基于 **Cloudflare Workers + D1 + R2** 与 **Vue 3** 构建的轻量、安全、极速文件与文本快递柜系统。

[![Vue 3](https://img.shields.io/badge/Vue-3.5-brightgreen.svg)](https://vuejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-purple.svg)](https://web.dev/progressive-web-apps/)

---

## ✨ 核心特性

- 🚀 **极简快递柜体验**：无需注册，放下即走；采用 **6 位精简取件码**（排除易混淆字符）与智能直达链接。
- 🔒 **端到端零知识加密（E2E AES-256-GCM）**：
  - 密钥仅存在于分享链接的 URL Fragment（`#key=...`）中；
  - 浏览器不会将 `#fragment` 发送给服务器，服务端仅存储密文；即使数据库或对象存储泄露也无法解密。
- 🔥 **原子阅后即焚状态机**：
  - 严格的状态流转：`AVAILABLE` ➔ `CLAIMED` ➔ `CONSUMED` ➔ `DELETED`；
  - 数据库原子 CAS 操作保障仅允许成功取件一次，随后自动销毁。
- ⚡ **分层边缘存储架构**：
  - **短文本 / Markdown**：直接入库 Cloudflare D1，毫秒级读取，不浪费对象存储请求；
  - **大型文件**：客户端直接通过预签名/代理流式直传 Cloudflare R2，不占用 Worker 内存与 CPU 时间。
- 🛡️ **生产级安全防护**：
  - **Cloudflare Turnstile**：无感人机验证，阻断自动化爬虫与滥用；
  - **边缘 Rate Limiting**：基于 IP 的智能频控限制，保障服务高可用。
- 📱 **Progressive Web App (PWA)**：
  - 完整的 `manifest.json` 与 Service Worker 离线底座，支持一键安装为手机/桌面原生 App。
- 🎨 **高质感玻璃拟态 UI (Glassmorphism)**：
  - 深色 / 浅色 / 系统自适应主题无缝切换；
  - 精致动效、拖拽上传、剪贴板快速粘贴识别、QR 快速扫码取件。

---

## 🏗️ 架构拓扑

```text
浏览器客户端 (Vue 3 SPA + PWA)
  │
  ├─ 文本 / 图片 / 文件拖拽 / 剪贴板快速粘贴
  ├─ 客户端端到端加解密 (AES-256-GCM)
  └─ 输入 6 位取件码 或 扫码一键提取
        │
        ▼
Cloudflare Edge Network
  ├─ Cloudflare Pages / Static Hosting (前端静态托管)
  ├─ Cloudflare Turnstile (人机验证)
  └─ Cloudflare Workers (边缘 API 网关 / 状态流转 / 密钥哈希)
        │
        ├─► D1 Database (记录元数据、过期时间、短文本、阅后即焚原子状态)
        └─► R2 Bucket (高可靠对象存储，承载大文件流)
```

---

## 🚀 快速开始

### 1. 运行环境要求
- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (推荐) 或 `mise`
- **Wrangler** >= 3.0.0 (Cloudflare CLI)

### 2. 克隆与安装依赖

```bash
git clone https://github.com/vastsa/FileCodeBox.git
cd FileCodeBox

# 安装前端依赖
pnpm install

# 安装 Worker 后端依赖
cd worker && pnpm install && cd ..
```

### 3. 本地开发与联调

启动本地 Cloudflare Worker 边缘服务（终端 1）：
```bash
cd worker
pnpm dev
# Worker 默认运行在 http://127.0.0.1:8787
```

启动前端开发服务器（终端 2）：
```bash
pnpm dev
# 前端默认运行在 http://localhost:5173
# 默认配置了 /api 反向代理至本地 8787 端口
```

打开浏览器访问 `http://localhost:5173` 即可开始使用。

---

## 🛠️ 生产部署指南

### 1. 准备 Cloudflare 资源

确保已登录 Cloudflare 账号：
```bash
pnpm --filter worker dlx wrangler login
```

创建 D1 数据库：
```bash
pnpm --filter worker dlx wrangler d1 create drop-db
```
复制终端输出的 `database_id`，填入 `worker/wrangler.toml` 中的 `database_id`。

初始化 D1 数据库表结构：
```bash
pnpm --filter worker dlx wrangler d1 execute drop-db --file=src/db/schema.sql
```

创建 R2 存储桶：
```bash
pnpm --filter worker dlx wrangler r2 bucket create drop-files
```

设置密钥变量（Secret）：
```bash
pnpm --filter worker dlx wrangler secret put PICKUP_CODE_SECRET
# 输入一段自定义强随机字符串（用于 HMAC-SHA256 哈希取件码）

pnpm --filter worker dlx wrangler secret put TURNSTILE_SECRET_KEY
# 填入 Cloudflare 控制台申请的 Turnstile Secret Key（如不启用可跳过）
```

### 2. 部署 Worker 后端

```bash
cd worker
pnpm run deploy
```

### 3. 构建与部署前端 (Cloudflare Pages)

修改 `.env.production`（若与 Worker 绑定在同一自定义域名下，可直接留空使用相对路径 `/api`）：
```env
VITE_WORKER_API_URL=
VITE_TURNSTILE_SITE_KEY=your-turnstile-site-key
```

打包前端应用：
```bash
pnpm build
```

打包产物位于 `dist/` 目录，可直接拖拽部署至 **Cloudflare Pages** 或使用 CLI 发布：
```bash
npx wrangler pages deploy dist --project-name drop-frontend
```

---

## 🔐 安全模型细节

1. **取件码单向哈希（HMAC-SHA256）**
   - 数据库中仅持久化 `pickup_code_hash = HMAC_SHA256(pickup_code, secret)`；
   - 即使 D1 数据库被拖库，由于无法反向逆推 6 位明文取件码，攻击者无法根据数据库记录提取文件。

2. **零知识端到端加密（Zero-Knowledge E2E Encryption）**
   - 用户选择“端到端加密”时，前端调用 `crypto.subtle` 本地生成 AES-GCM-256 密钥；
   - 文本和文件均在浏览器端完全加密后再上传，服务端仅保存密文；
   - 解密密钥通过 URL Fragment（形如 `https://drop.example.com/#/?code=X7K9P2#key=...`）传递；
   - 依据 RFC 规范，URL Hash 不会被包含在 HTTP 请求头中发送至服务器。

3. **阅后即焚（Burn After Read）原子锁**
   - 服务端取件使用原子更新：`UPDATE parcels SET status = 'CLAIMED' WHERE id = ? AND status = 'AVAILABLE'`；
   - 高并发请求下确保仅有单一请求能够成功 Claim 内容，后续请求立即返回 403 已销毁。

---

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 协议开源。
