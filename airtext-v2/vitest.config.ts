import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: { bindings: {
      TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
      APP_SECRET: "test-secret-at-least-24-characters-long",
    } },
  }))],
  test: { fileParallelism: false, setupFiles: ["./test/setup.ts"], exclude: ["node_modules/**", "e2e/**"] },
});
