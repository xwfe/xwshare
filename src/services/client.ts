/**
 * Auth event constants.
 *
 * 全局事件名，用于跨模块广播认证状态变化。
 * worker-client.ts 在收到 401 时触发 UNAUTHORIZED，
 * useAppShell 监听它来自动登出并跳转登录页。
 */
export const AUTH_EVENTS = {
  UNAUTHORIZED: 'xwshare:auth:unauthorized',
  SETUP_REQUIRED: 'xwshare:setup:required'
} as const
