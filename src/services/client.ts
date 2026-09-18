import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_STATUS_CODES, TIME_CONSTANTS } from '@/constants'
import type { ApiErrorPayload } from '@/types'
import { clearStoredToken, hasValidStoredAdminSession, readStoredToken } from '@/utils/auth-storage'

export const AUTH_EVENTS = {
  UNAUTHORIZED: 'filecodebox:auth:unauthorized',
  SETUP_REQUIRED: 'filecodebox:setup:required'
} as const

/** 旧 Python 后端已移除。管理后台代码若被误调用，会打到当前源站并 404，而不是 localhost:12345。 */
export const apiBaseURL = ''

const clientOptions = {
  baseURL: apiBaseURL,
  timeout: TIME_CONSTANTS.REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
}

const apiClient = axios.create(clientOptions)
export const rawApiClient = axios.create(clientOptions)

const attachAuthToken = (config: InternalAxiosRequestConfig) => {
  if (hasValidStoredAdminSession()) {
    const token = readStoredToken()
    config.headers.Authorization = `Bearer ${token}`
  } else {
    clearStoredToken()
  }
  return config
}

const handleAuthError = (error: AxiosError<ApiErrorPayload>) => {
  if (error.response?.status === API_STATUS_CODES.UNAUTHORIZED) {
    clearStoredToken()
    window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED))
  }
  return Promise.reject(error)
}

apiClient.interceptors.request.use(attachAuthToken, (error) => Promise.reject(error))

rawApiClient.interceptors.request.use(attachAuthToken, (error) => Promise.reject(error))

apiClient.interceptors.response.use((response) => response.data, handleAuthError)

rawApiClient.interceptors.response.use((response) => response, handleAuthError)

export default apiClient
