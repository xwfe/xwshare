# 系统架构说明 (System Architecture)

本文档记录基于 **Cloudflare Workers + D1 + R2 + Vue 3** 的现代化快递柜系统整体架构、分层职责与核心数据流。

---

## 1. 整体架构拓扑

```text
                  [ 浏览器 (Browser SPA / PWA) ]
                   │                         │
            (文本/取件/元数据)            (文件流直传)
                   │                         │
                   ▼                         │
   [ Cloudflare Worker (API / 状态机) ]      │
       │                   │                 │
 (HMAC 哈希校验)     (Turnstile / 限速)       │
       │                   │                 │
       ▼                   ▼                 ▼
  [ Cloudflare D1 ]   [ 审计 / 日志 ]   [ Cloudflare R2 ]
  (元数据/短文本/状态)                 (大文件对象存储)
```

---

## 2. 核心概念模型：Parcel（快递件）

系统不再以“分享链接”作为一级业务实体，统一抽象为 **Parcel（快递件）**：

| 实体属性 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | UUID (string) | 快递唯一物理标识 |
| `pickup_code_hash` | string | 6 位取件码的 HMAC-SHA256 哈希值（不持久化明文取件码） |
| `type` | text \| markdown \| file | 快递载荷类型 |
| `title` | string | 文件名称或简要说明 |
| `content` | text | 短文本或 Markdown 内容（直接存 D1，不走 R2） |
| `file_key` | string | 对象存储中的文件唯一键（`files/{id}/{filename}`） |
| `file_size` | number | 字节大小 |
| `expires_at` | ISO 8601 | 过期失效时间戳（支持 1h / 1d / 7d） |
| `burn_after_read` | boolean | 是否开启阅后即焚（取件即销毁） |
| `max_downloads` | number | 允许的最大取件次数（0 = 无限制） |
| `download_count` | number | 当前已被提取的次数计数 |
| `encrypted` | boolean | 是否由客户端执行了 AES-256-GCM 端到端加密 |
| `status` | enum | 状态机：`AVAILABLE` ➔ `CLAIMED` ➔ `CONSUMED` ➔ `DELETED` |

---

## 3. 端到端零知识加密 (Zero-Knowledge E2E Encryption)

```text
[寄件客户端]
  ├─ 1. crypto.subtle 生成随机 256 位 AES-GCM 密钥 Key
  ├─ 2. 在本地内存中对明文/文件流执行加密 (IV: 12 字节)
  ├─ 3. 将加密后的密文 Ciphertext 发送给 Worker (D1/R2)
  └─ 4. 生成分享 URL：https://drop.example.com/#/?code=X7K9P2#key={Key}
        │
        └─► #key 仅存在于 URL Fragment，遵循 RFC 规范，浏览器绝对不会将其随 HTTP 头发送给服务器

[收件客户端]
  ├─ 1. 打开带 #key={Key} 的链接，从 location.hash 解析 Key
  ├─ 2. 使用 6 位取件码请求 Worker API 获取密文载荷
  ├─ 3. 在浏览器端使用 Web Crypto API 完成解密
  └─ 4. 向用户展示解密后的文本或触发文件下载
```

---

## 4. 存储适配层 (StorageProvider Interface)

Worker 后端通过接口与具体存储解耦，为后续接入自建存储（如 MinIO、本地 NAS、HP 400 G4）提供无缝扩展能力：

```typescript
export interface StorageProvider {
  createUploadUrl(fileKey: string, contentType: string, contentLength: number): Promise<UploadInstructions>
  getDownloadUrl(fileKey: string): Promise<string>
  delete(fileKey: string): Promise<void>
  exists(fileKey: string): Promise<boolean>
}
```

- **当前实现**：`R2Storage`，基于 Cloudflare 原生 R2 存储桶绑定（`env.BUCKET`）。
- **预留能力**：通过环境变量或工厂方法按需切换至 S3、WebDAV 或本地节点。

---

## 5. 前端架构分层与工程约束

前端代码严格遵循单一职责分层，禁止跨层反向渗透：

- **页面层 (`src/views/`)**：
  - 只负责布局编排、组件组合与路由跳转，不直接调用 `fetch` 或 `axios`。
- **组件层 (`src/components/`)**：
  - 纯 UI 渲染单元，只通过 `props` 接收数据并通过 `emit` 抛出用户事件。
- **流程组合层 (`src/composables/`)**：
  - 承载完整的业务流程生命周期（如 `useSendFlow`、`useRetrieveFlow`、`useSendSubmit`）。
- **服务网关层 (`src/services/`)**：
  - 统一封装边缘网关请求（`ParcelService`、`FileService`）。
- **纯工具层 (`src/utils/`)**：
  - 无副作用的纯函数集合（如 `crypto.ts` 加解密、`share-url.ts` 链接生成、`clipboard.ts`）。
- **状态存储层 (`src/stores/`)**：
  - 仅用于管理全局性持久化或跨页面状态（`alertStore`、`fileData` 等）。
