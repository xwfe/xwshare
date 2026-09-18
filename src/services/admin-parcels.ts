import { workerFetch } from './worker-client'

export type AdminParcel = {
  id: string
  type: 'text' | 'markdown' | 'file'
  title: string
  file_size: number
  status: 'PENDING' | 'AVAILABLE' | 'CLAIMED' | 'DELETED'
  expires_at: string
  created_at: string
  download_count: number
  max_downloads: number
  burn_after_read: number
  encrypted: number
}

export class AdminParcelService {
  static async list(status = '', limit = 50, offset = 0) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset)
    })
    if (status) params.set('status', status)
    const res = await workerFetch<{ items: AdminParcel[]; total: number }>(
      `/api/admin/parcels?${params.toString()}`,
      {},
      true
    )
    if (!res.data) throw new Error('Empty response from worker')
    return res.data
  }

  static async remove(id: string) {
    await workerFetch(`/api/admin/parcels/${id}`, { method: 'DELETE' }, true)
  }
}
