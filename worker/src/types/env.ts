export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  PICKUP_CODE_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  /** 环境标识，开发时设为 'development' 可跳过 Turnstile 验证 */
  ENVIRONMENT?: string;
}
