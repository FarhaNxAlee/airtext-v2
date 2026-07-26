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
  maxFileSizeMB: 500,
  maxBatchTotalMB: 5_000,
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

  if (!user) return anonymous;
  if (user.rank === 0) return ADMIN_LIMITS;

  return {
    ...anonymous,
    ...parsePartialLimits(user.roleDefaultLimits),
    ...parsePartialLimits(user.customLimits),
  };
}
