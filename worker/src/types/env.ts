export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  PICKUP_CODE_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
}
