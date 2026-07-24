export interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  SHARE_KV: KVNamespace;
  ASSETS: Fetcher;
  APP_SECRET: string;
  ADMIN_PASSWORD: string;
  ENVIRONMENT?: string;
}
