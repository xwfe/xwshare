import { apiBaseURL } from '@/services/client'

const getApiOrigin = () => {
  if (!apiBaseURL) return window.location.origin
  return new URL(apiBaseURL, window.location.origin).origin
}

export function buildAbsoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getApiOrigin()}${normalizedPath}`
}

export function buildRetrieveUrl(code: string, encryptionKey?: string): string {
  const base = `${window.location.origin}/#/?code=${code}`
  // 密钥拼接在 hash query 内用 &key=，避免双 # 导致部分平台截断
  return encryptionKey ? `${base}&key=${encryptionKey}` : base
}

export function buildDownloadUrl(downloadUrl: string | null): string {
  return downloadUrl ? buildAbsoluteUrl(downloadUrl) : ''
}

export function buildReceivedRecordQrValue(record: {
  code: string
  downloadUrl: string | null
}): string {
  return record.downloadUrl ? buildDownloadUrl(record.downloadUrl) : buildRetrieveUrl(record.code)
}

export function buildSentRecordQrValue(record: { retrieveCode: string; encryptionKey?: string }): string {
  return buildRetrieveUrl(record.retrieveCode, record.encryptionKey)
}

export function buildWgetCommand(retrieveCode: string, fileName: string): string {
  return `wget ${buildAbsoluteUrl(`/share/select?code=${retrieveCode}`)} -O "${fileName}"`
}
