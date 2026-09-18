import { AUTH_EVENTS } from './client'
import { readStoredToken } from '@/utils/auth-storage'
import type { WorkerApiResponse } from '@/types/parcel'

export const getWorkerBaseUrl = (): string => {
  const url = import.meta.env.VITE_WORKER_API_URL
  return typeof url === 'string' && url ? url.replace(/\/+$/, '') : ''
}

export async function workerFetch<T>(
  path: string,
  options: RequestInit = {},
  withAdminAuth = false
): Promise<WorkerApiResponse<T>> {
  const { headers: optHeaders, ...rest } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(optHeaders as Record<string, string>)
  }
  if (withAdminAuth) {
    const token = readStoredToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${getWorkerBaseUrl()}${path}`, {
    ...rest,
    headers
  })
  const json = (await res.json()) as WorkerApiResponse<T>
  if (res.status === 401 && withAdminAuth) {
    window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED))
  }
  if (!res.ok) {
    throw new Error(json.error || `Worker API error: ${res.status}`)
  }
  return json
}
