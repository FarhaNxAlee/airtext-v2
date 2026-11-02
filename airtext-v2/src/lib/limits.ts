import type { Env } from "../types";
import { getSiteSettings } from "./settings";
import type { AuthenticatedUser } from "../middleware/auth";

/**
 * The single source of truth for "what can this request do", whether
 * anonymous or logged in. Anonymous falls back to the site-wide settings
 * (admin-editable via Settings -> File sharing limits); logged-in users
 * get their role's default_limits, shallow-merged with any per-user
 * custom_limits override (see migrations/0001_accounts.sql).
 */
export interface EffectiveLimits {
  ttlSeconds: number;
  maxTextLength: number;
  maxFileSizeMB: number;
  maxBatchTotalMB: number;
  maxFilesPerBatch: number;
  fileTtlSeconds: number;
  allowCustomCode: boolean;
  allowClientEncryption: boolean;
}

// Admin (rank 0) limits are intentionally hardcoded here, not stored in
// roles.default_limits -- generous but not literally infinite, so a
// runaway admin script still can't unbound D1/R2 usage.
const ADMIN_LIMITS: EffectiveLimits = {
  ttlSeconds: 30 * 24 * 60 * 60,
  maxTextLength: 200_000,
  maxFileSizeMB: 20,
  maxBatchTotalMB: 30,
  maxFilesPerBatch: 100,
  fileTtlSeconds: 30 * 24 * 60 * 60,
  allowCustomCode: true,
  allowClientEncryption: true,
};

function parsePartialLimits(json: string | null | undefined): Partial<EffectiveLimits> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Partial<EffectiveLimits>) : {};
  } catch {
    return {};
  }
}

// Bounds for validating client-supplied partial-limits payloads (per-user
// custom_limits override in users.ts, per-role default_limits in the roles
// endpoint). Mirrors the clamp philosophy of settings.ts's NUMERIC_RANGES,
// but the ceilings sit above ADMIN_LIMITS above -- these are legitimate
// per-user/per-role overrides, not the site-wide anonymous defaults, so
// an admin should be able to grant a Pro user more than an anonymous
// visitor gets without hitting an artificial wall.
const LIMITS_NUMERIC_RANGES: Record<string, [number, number]> = {
  ttlSeconds: [60, 30 * 24 * 60 * 60], // 1 minute .. 30 days
  maxTextLength: [100, 200_000], // matches ADMIN_LIMITS' ceiling
  maxFileSizeMB: [1, 1_000], // above ADMIN_LIMITS' 500MB ceiling
  maxBatchTotalMB: [1, 10_000], // above ADMIN_LIMITS' 5,000MB ceiling
  maxFilesPerBatch: [1, 200], // above ADMIN_LIMITS' 100
  fileTtlSeconds: [60, 30 * 24 * 60 * 60],
};
const LIMITS_BOOLEAN_KEYS: ReadonlySet<string> = new Set(["allowCustomCode", "allowClientEncryption"]);

/**
 * Validates a partial EffectiveLimits payload from the client (custom_limits
 * or default_limits) before it's stored as JSON. Unknown keys are dropped
 * silently, numeric keys are clamped into sane bounds, booleans are
 * coerced -- same lenient-sanitize convention as sanitizeSettings() in
 * settings.ts, so a malformed request degrades gracefully instead of
 * erroring or corrupting the stored override.
 */
export function sanitizePartialLimits(input: unknown): Partial<EffectiveLimits> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: Partial<Record<keyof EffectiveLimits, unknown>> = {};

  for (const key of Object.keys(source)) {
    const range = LIMITS_NUMERIC_RANGES[key];
    if (range) {
      const value = Number(source[key]);
      if (Number.isFinite(value)) {
        result[key as keyof EffectiveLimits] = Math.max(range[0], Math.min(range[1], Math.round(value)));
      }
      // non-numeric value for a numeric key: dropped, not defaulted --
      // there is no "current value" to fall back to in a partial override.
    } else if (LIMITS_BOOLEAN_KEYS.has(key)) {
      result[key as keyof EffectiveLimits] = Boolean(source[key]);
    }
    // any other key is silently dropped
  }
  return result as Partial<EffectiveLimits>;
}

export async function getEffectiveLimits(env: Env, user?: AuthenticatedUser | null): Promise<EffectiveLimits> {
  const settings = await getSiteSettings(env);
  const anonymous: EffectiveLimits = {
    ttlSeconds: settings.ttlSeconds,
    maxTextLength: settings.maxTextLength,
    maxFileSizeMB: settings.maxFileSizeMB,
    maxBatchTotalMB: settings.maxBatchTotalMB,
    maxFilesPerBatch: settings.maxFilesPerBatch,
    fileTtlSeconds: settings.fileTtlSeconds,
    allowCustomCode: false,
    allowClientEncryption: false,
  };

  anonymous.maxFileSizeMB = Math.min(20, anonymous.maxFileSizeMB);
  anonymous.maxBatchTotalMB = Math.min(30, anonymous.maxBatchTotalMB);
  if (!user) return anonymous;
  if (user.rank === 0) return ADMIN_LIMITS;

  const merged = {
    ...anonymous,
    ...parsePartialLimits(user.roleDefaultLimits),
    ...parsePartialLimits(user.customLimits),
  };
  return { ...merged, maxFileSizeMB: Math.min(20, merged.maxFileSizeMB), maxBatchTotalMB: Math.min(30, merged.maxBatchTotalMB) };
}
