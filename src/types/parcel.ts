/** 快递件类型 */
export type ParcelType = 'text' | 'markdown' | 'file'

/** 有效期选项 */
export type ExpiresIn = '1h' | '1d' | '7d'

/** 快递件状态（服务端维护） */
export type ParcelStatus = 'AVAILABLE' | 'CLAIMED' | 'CONSUMED' | 'DELETED'

/** 创建文本快递请求 */
export interface CreateTextParcelRequest {
  type: 'text' | 'markdown'
  title?: string
  content: string
  expiresIn: ExpiresIn
  burnAfterRead?: boolean
  maxDownloads?: number
  turnstileToken: string
  /** 客户端加密后，将 true 传给服务端标记密文 */
  encrypted?: boolean
}

/** 创建文件快递请求 */
export interface CreateFileParcelRequest {
  fileName: string
  fileSize: number
  contentType: string
  expiresIn: ExpiresIn
  burnAfterRead?: boolean
  maxDownloads?: number
  turnstileToken: string
  encrypted?: boolean
}

/** 创建快递成功响应 */
export interface CreateParcelResponse {
  code: string
  expiresAt: string
  /** 仅文件类型：Worker 代理上传 URL */
  uploadUrl?: string
  /** 仅文件类型：R2 object key */
  fileKey?: string
}

/** 取件响应 */
export interface PickupResponse {
  type: ParcelType
  title: string
  /** 文本/Markdown 内容（可能是密文） */
  content?: string
  /** 文件下载 URL */
  downloadUrl?: string
  fileName?: string
  fileSize?: number
  mimeType?: string
  expiresAt: string
  burnAfterRead?: boolean
  encrypted?: boolean
}

/** Worker API 统一响应包装 */
export interface WorkerApiResponse<T = unknown> {
  data?: T
  error?: string
  code?: string
}
