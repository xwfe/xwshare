/**
 * E2E 加密工具
 *
 * 使用 AES-256-GCM 在客户端加密/解密内容。
 * 密钥通过 URL fragment (#key=xxx) 传递，永远不会发送到服务器。
 *
 * 流程：
 *   寄件 → generateKey() → encrypt(plaintext, key) → 上传密文 → 分享带 #key 的链接
 *   取件 → 从 URL fragment 提取 key → 下载密文 → decrypt(ciphertext, key)
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12

/**
 * 生成一个随机 AES-256 密钥，返回 base64url 编码字符串
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable
    ['encrypt', 'decrypt']
  )
  const raw = await crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64Url(raw)
}

/**
 * 加密文本内容
 * @returns base64url 编码的 `iv:ciphertext` 格式字符串
 */
export async function encryptText(plaintext: string, keyBase64Url: string): Promise<string> {
  const key = await importKey(keyBase64Url)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  )

  // 格式: base64url(iv) + '.' + base64url(ciphertext)
  return arrayBufferToBase64Url(iv.buffer) + '.' + arrayBufferToBase64Url(ciphertext)
}

/**
 * 解密文本内容
 * @param encrypted `iv.ciphertext` 格式的 base64url 字符串
 */
export async function decryptText(encrypted: string, keyBase64Url: string): Promise<string> {
  const [ivPart, ciphertextPart] = encrypted.split('.')
  if (!ivPart || !ciphertextPart) {
    throw new Error('Invalid encrypted format')
  }

  const key = await importKey(keyBase64Url)
  const iv = new Uint8Array(base64UrlToArrayBuffer(ivPart))
  const ciphertext = base64UrlToArrayBuffer(ciphertextPart)

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}

/**
 * 加密文件（返回加密后的 Blob）
 */
export async function encryptFile(file: File, keyBase64Url: string): Promise<Blob> {
  const key = await importKey(keyBase64Url)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const data = await file.arrayBuffer()

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  )

  // 前 12 字节是 IV，后面是密文
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_LENGTH)

  return new Blob([combined], { type: 'application/octet-stream' })
}

/**
 * 解密文件（返回解密后的 Blob）
 */
export async function decryptFile(
  encryptedBlob: Blob,
  keyBase64Url: string,
  mimeType: string
): Promise<Blob> {
  const key = await importKey(keyBase64Url)
  const data = await encryptedBlob.arrayBuffer()

  const iv = new Uint8Array(data.slice(0, IV_LENGTH))
  const ciphertext = data.slice(IV_LENGTH)

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  )

  return new Blob([plaintext], { type: mimeType })
}

/**
 * 从 URL fragment 中提取加密密钥
 */
export function extractEncryptionKey(hash: string): string | null {
  if (!hash || !hash.includes('key=')) return null
  const match = hash.match(/key=([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

// --- 内部工具函数 ---

async function importKey(keyBase64Url: string): Promise<CryptoKey> {
  const raw = base64UrlToArrayBuffer(keyBase64Url)
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
