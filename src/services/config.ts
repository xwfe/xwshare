import type { ApiResponse, ConfigState, PublicConfigPayload } from '@/types'
import { FILE_SIZE_LIMITS } from '@/constants'
import { workerFetch } from './worker-client'

type WorkerPublicConfig = {
  name: string
  maxFileSize: number
  expireStyle: string[]
  openUpload: number
  turnstileEnabled: boolean
}

export class ConfigService {
  /** 获取公开配置（站点名、限制、开关） */
  static async getUserConfig(): Promise<ApiResponse<PublicConfigPayload>> {
    const res = await workerFetch<WorkerPublicConfig>('/api/config')
    const config = res.data
    return {
      code: 200,
      detail: {
        config: {
          name: config?.name || 'xwshare',
          uploadSize: config?.maxFileSize || FILE_SIZE_LIMITS.MAX_FILE_SIZE,
          expireStyle: config?.expireStyle || ['hour', 'day'],
          openUpload: config?.openUpload ?? 1
        } as Partial<ConfigState>
      }
    }
  }
}

