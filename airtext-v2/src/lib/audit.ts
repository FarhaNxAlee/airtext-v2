import type { Env } from "../types";
import { randomBase64Url } from "./crypto";

/**
 * Generic audit-log writer for admin-panel actions (Phase 8 groundwork,
 * see V3-PLAN.md section 8). Follows the same "never break the calling
 * request" pattern as recordEvent() in analytics.ts -- a logging failure
 * here is swallowed, not surfaced, since this is a non-critical write.
 *
 * Not wired into any route yet; a later phase will call this from
 * admin.ts/users.ts etc. wherever a moderation/admin action happens.
 */

export interface RecordAuditParams {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ipHash?: string;
}

export async function recordAudit(env: Env, params: RecordAuditParams): Promise<void> {
  try {
    const id = randomBase64Url(16);
    const createdAt = Date.now();
    await env.DB.prepare(
      `INSERT INTO audit_log (
        id, actor_user_id, actor_email, action, target_type, target_id,
        before_json, after_json, ip_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        params.actorUserId ?? null,
        params.actorEmail ?? null,
        params.action,
        params.targetType ?? null,
        params.targetId ?? null,
        params.before !== undefined ? JSON.stringify(redactAudit(params.before)) : null,
        params.after !== undefined ? JSON.stringify(redactAudit(params.after)) : null,
        params.ipHash ?? null,
        createdAt,
      )
      .run();
  } catch (error) {
    console.warn("D1 audit log write skipped", error);
  }
}

/** Content and credentials do not belong in operational history. */
function redactAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAudit);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(text|body|pin|password|passwordHash|passwordSalt|pinHash|pinSalt|deleteToken|token|ciphertext|encryptionKey)$/i.test(key)).map(([key, item]) => [key, redactAudit(item)]));
}
