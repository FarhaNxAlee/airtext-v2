import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getEffectiveLimits } from "../src/lib/limits";

describe("getEffectiveLimits", () => {
  it("falls back to site settings for anonymous requests", async () => {
    const limits = await getEffectiveLimits(env, null);
    expect(limits.maxFileSizeMB).toBe(2);
    expect(limits.maxBatchTotalMB).toBe(30);
    expect(limits.maxFilesPerBatch).toBe(15);
    expect(limits.allowCustomCode).toBe(false);
    expect(limits.allowClientEncryption).toBe(false);
  });

  it("returns hardcoded generous limits for admin (rank 0), ignoring role/custom limits", async () => {
    const limits = await getEffectiveLimits(env, {
      id: "x",
      email: "a@b.com",
      displayName: "A",
      rank: 0,
      roleName: "Admin",
      roleDefaultLimits: "{}",
      customLimits: JSON.stringify({ maxFileSizeMB: 1 }),
    });
    expect(limits.maxFileSizeMB).toBe(20);
    expect(limits.allowCustomCode).toBe(true);
  });

  it("applies role default_limits for a non-admin user", async () => {
    const limits = await getEffectiveLimits(env, {
      id: "x",
      email: "a@b.com",
      displayName: "A",
      rank: 2,
      roleName: "Pro",
      roleDefaultLimits: JSON.stringify({ ttlSeconds: 86_400, maxFileSizeMB: 5, allowCustomCode: true }),
      customLimits: null,
    });
    expect(limits.ttlSeconds).toBe(86_400);
    expect(limits.maxFileSizeMB).toBe(5);
    expect(limits.allowCustomCode).toBe(true);
    // keys the role doesn't set fall back to the anonymous/site-settings shape
    expect(limits.maxBatchTotalMB).toBe(30);
  });

  it("merges per-user customLimits over the role defaults", async () => {
    const limits = await getEffectiveLimits(env, {
      id: "x",
      email: "a@b.com",
      displayName: "A",
      rank: 2,
      roleName: "Pro",
      roleDefaultLimits: JSON.stringify({ maxFileSizeMB: 5, maxBatchTotalMB: 50 }),
      customLimits: JSON.stringify({ maxFileSizeMB: 999 }),
    });
    expect(limits.maxFileSizeMB).toBe(20); // platform-safe cap applies to custom overrides
    expect(limits.maxBatchTotalMB).toBe(30); // batch buffering is bounded for every role
  });
});
