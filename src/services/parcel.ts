/**
 * Parcel API Service
 *
 * 封装与 Cloudflare Worker 后端的 Parcel（快递件）相关通信。
 * 文本直接存 D1，文件通过 Worker 代理上传到 R2。
 */
import type {
  CreateTextParcelRequest,
  CreateFileParcelRequest,
  CreateParcelResponse,
  PickupResponse,
  WorkerApiResponse
} from '@/types/parcel'

/** Worker API 基础路径（开发环境为 wrangler dev server，生产环境同域） */
const getWorkerBaseUrl = (): string => {
  const url = import.meta.env.VITE_WORKER_API_URL
  return typeof url === 'string' && url ? url.replace(/\/+$/, '') : ''
}

async function workerFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<WorkerApiResponse<T>> {
  const base = getWorkerBaseUrl()
  const url = `${base}${path}`

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })

  const json = (await res.json()) as WorkerApiResponse<T>

  if (!res.ok) {
    throw new Error(json.error || `Worker API error: ${res.status}`)
  }

  return json
}

export class ParcelService {
  /** 创建文本/Markdown 快递 */
  static async createTextParcel(
    req: CreateTextParcelRequest
  ): Promise<CreateParcelResponse> {
    const res = await workerFetch<CreateParcelResponse>('/api/parcels', {
      method: 'POST',
      body: JSON.stringify(req)
    })
    if (!res.data) throw new Error('Empty response from worker')
    return res.data
  }

  /** 创建文件快递（获取上传 URL） */
  static async createFileParcel(
    req: CreateFileParcelRequest
  ): Promise<CreateParcelResponse> {
    const res = await workerFetch<CreateParcelResponse>('/api/parcels/upload', {
      method: 'POST',
      body: JSON.stringify(req)
    })
    if (!res.data) throw new Error('Empty response from worker')
    return res.data
  }

  /** 直接上传文件到 Worker 代理端点（Worker 再写入 R2） */
  static async uploadFile(
    uploadUrl: string,
    file: File | Blob,
    contentType: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    // 如果需要进度回调，使用 XMLHttpRequest
    if (onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', contentType)

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(e.loaded, e.total)
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`))
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Upload network error')))
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

        xhr.send(file)
      })
    }

    // 无进度回调时直接用 fetch
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    })

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status}`)
    }
  }

  /** 确认文件上传完成 */
  static async confirmUpload(code: string): Promise<void> {
    await workerFetch('/api/parcels/confirm-upload', {
      method: 'POST',
      body: JSON.stringify({ code })
    })
  }

  /** 取件 */
  static async pickup(code: string): Promise<PickupResponse> {
    const res = await workerFetch<PickupResponse>('/api/pickup', {
      method: 'POST',
      body: JSON.stringify({ code })
    })
    if (!res.data) throw new Error('Empty response from worker')
    return res.data
  }

  /** 下载文件（返回 Blob） */
  static async downloadFile(downloadUrl: string): Promise<Blob> {
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status}`)
    }
    return res.blob()
  }
}
