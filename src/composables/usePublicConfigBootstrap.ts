import { ConfigService } from '@/services'
import { useConfigStore } from '@/stores/configStore'

export function usePublicConfigBootstrap() {
  const configStore = useConfigStore()

  const syncPublicConfig = async () => {
    try {
      const res = await ConfigService.getUserConfig()
      if (res.code !== 200 || !res.detail) return
      if (res.detail.meta) configStore.applyPublicMeta(res.detail.meta)
      configStore.applyRemoteConfig(res.detail.config)
    } catch {
      // Worker 不可达时用本地默认配置，不打断寄取件
    }
  }

  return { syncPublicConfig }
}
