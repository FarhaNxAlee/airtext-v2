import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    FILES_BUCKET: R2Bucket;
    SHARE_KV: KVNamespace;
    ASSETS: Fetcher;
    APP_SECRET: string;
    ADMIN_PASSWORD: string;
    TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
