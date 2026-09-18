import type { ApiResponse, DashboardData } from '@/types'
import { workerFetch } from './worker-client'

type WorkerStats = {
  totalFiles: number
  activeCount: number
  pendingCount: number
  claimedCount: number
  fileCount: number
  textCount: number
  storageUsed: number
  todayCount: number
  yesterdayCount: number
  storageBackend: string
}

export class StatsService {
  static async getDashboard(): Promise<ApiResponse<DashboardData>> {
    const res = await workerFetch<WorkerStats>('/api/admin/stats', {}, true)
    if (!res.data) throw new Error('Empty response from worker')
    return {
      code: 200,
      detail: {
        totalFiles: res.data.totalFiles,
        activeCount: res.data.activeCount,
        fileCount: res.data.fileCount,
        textCount: res.data.textCount,
        storageUsed: res.data.storageUsed,
        todayCount: res.data.todayCount,
        yesterdayCount: res.data.yesterdayCount,
        storageBackend: res.data.storageBackend,
        yesterdaySize: 0,
        todaySize: 0,
        sysUptime: null
      }
    }
  }
}
