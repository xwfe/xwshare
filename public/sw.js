/// <reference lib="webworker" />

/**
 * 最小 Service Worker：仅提供 PWA 安装能力和基本离线缓存
 * 不做激进的缓存策略，避免缓存 API 响应
 */

const CACHE_NAME = 'drop-v1'

// 预缓存的静态资源（Vite 构建产物会自带 hash，不会有缓存过期问题）
const PRECACHE_URLS: string[] = [
  '/',
]

self.addEventListener('install', (event: Event) => {
  const installEvent = event as ExtendableEvent
  installEvent.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  // 跳过等待，立即激活
  ;(self as unknown as ServiceWorkerGlobalScope).skipWaiting()
})

self.addEventListener('activate', (event: Event) => {
  const activateEvent = event as ExtendableEvent
  activateEvent.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  )
  ;(self as unknown as ServiceWorkerGlobalScope).clients.claim()
})

self.addEventListener('fetch', (event: Event) => {
  const fetchEvent = event as FetchEvent
  const { request } = fetchEvent

  // 只缓存 GET 请求，且不缓存 API 请求
  if (request.method !== 'GET' || request.url.includes('/api/')) {
    return
  }

  fetchEvent.respondWith(
    fetch(request)
      .then((response) => {
        // 仅缓存成功的同源响应
        if (response.ok && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() =>
        // 网络失败时尝试从缓存返回
        caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 }))
      )
  )
})
