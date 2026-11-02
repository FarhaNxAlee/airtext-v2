import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach } from "vitest";
import { clearSiteSettingsCache } from "../src/lib/settings";

declare global {
  namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES_BUCKET: R2Bucket;
    SHARE_KV: KVNamespace;
    ASSETS: Fetcher;
    APP_SECRET: string;
    TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
  }
  }
}

beforeEach(async () => {
  await reset();
  clearSiteSettingsCache();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
