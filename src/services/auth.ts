import type { AdminUser, ApiResponse } from '@/types'
import { workerFetch } from './worker-client'

const toResponse = (detail: AdminUser): ApiResponse<AdminUser> => ({
  code: 200,
  detail
})

export class AuthService {
  static async login(password: string): Promise<ApiResponse<AdminUser>> {
    const res = await workerFetch<AdminUser>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    })
    if (!res.data?.token) throw new Error('Empty response from worker')
    return toResponse(res.data)
  }

  static async logout(): Promise<ApiResponse> {
    return { code: 200 }
  }

  static async verifyToken(): Promise<ApiResponse<AdminUser>> {
    const res = await workerFetch<AdminUser>('/api/admin/me', {}, true)
    if (!res.data?.token) throw new Error('Empty response from worker')
    return toResponse(res.data)
  }
}
