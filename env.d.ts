/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __GIT_COMMIT__: string

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL_DEV?: string
  readonly VITE_API_BASE_URL_PROD?: string
  readonly VITE_WORKER_API_URL?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

