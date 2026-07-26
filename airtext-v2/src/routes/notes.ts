import { Hono } from "hono";
import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { getSiteSettings } from "../lib/settings";
import { getEffectiveLimits } from "../lib/limits";
import { jsonResponse, jsonError, readJsonBody } from "../lib/http";
import { hmacHex, hashPin, constantTimeEqual, randomBase64Url, randomShareCode } from "../lib/crypto";
import { normalizeTitle, normalizeText, normalizeShareCode, formatServerDuration, isExpired } from "../lib/util";
import { getRoomId, getClientIpHash, getAuthenticatedUser } from "../middleware/auth";
import { enforceCooldown } from "../middleware/rateLimit";
import { recordEvent } from "../lib/analytics";

/** Ported from airtext-worker-modern.js:1621-1870 (the live `d1Handle*` note handlers).
 *  Phase 5 adds optional user attribution (userId + sharedBy on the public payload)
 *  on top of the original anonymous-only model -- anonymous shares are unaffected. */

export interface SharedBy {
  name: string;
  role: string;
  rank: number;
}

export interface NoteRow {
  id: string;
  roomId: string;
  title: string;
  text: string;
  locked: boolean;
  pinSalt: string | null;
  pinHash: string | null;
  code: string;
  deleteTokenHash: string;
  createdAt: number;
  expiresAt: number;
  userId: string | null;
  sharedBy: SharedBy | null;
}

interface RawNoteRow {
  id: string;
  room_id?: string;
  title?: string;
  body?: string;
  locked?: number;
  pin_salt?: string | null;
  pin_hash?: string | null;
  code?: string;
  delete_token_hash?: string;
  created_at?: number;
  expires_at?: number;
  user_id?: string | null;
  shared_by_name?: string | null;
  shared_by_role?: string | null;
  shared_by_rank?: number | null;
}

// Shared by every query that needs to attribute a note to its creator.
const SHARED_BY_JOIN = `LEFT JOIN users u ON u.id = n.user_id LEFT JOIN roles r ON r.id = u.role_id`;
const SHARED_BY_COLUMNS = `u.display_name AS shared_by_name, r.name AS shared_by_role, r.rank AS shared_by_rank`;

function rowToNote(row: RawNoteRow | null | undefined): NoteRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    roomId: String(row.room_id || ""),
    title: String(row.title || "Untitled"),
    text: String(row.body || ""),
    locked: Boolean(row.locked),
    pinSalt: row.pin_salt ? String(row.pin_salt) : null,
    pinHash: row.pin_hash ? String(row.pin_hash) : null,
    code: String(row.code || ""),
    deleteTokenHash: String(row.delete_token_hash || ""),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    userId: row.user_id || null,
    sharedBy: row.shared_by_name
      ? { name: String(row.shared_by_name), role: String(row.shared_by_role || ""), rank: Number(row.shared_by_rank) }
      : null,
  };
}

async function getNoteById(env: Env, noteId: string): Promise<NoteRow | null> {
  const row = await env.DB.prepare(
    `SELECT n.*, ${SHARED_BY_COLUMNS} FROM notes n ${SHARED_BY_JOIN} WHERE n.id = ? AND n.expires_at > ?`,
  )
    .bind(noteId, Date.now())
    .first<RawNoteRow>();
  return rowToNote(row);
}

async function getNoteByCode(env: Env, rawCode: string): Promise<NoteRow | null> {
  const code = normalizeShareCode(rawCode);
  const row = await env.DB.prepare(
    `SELECT n.*, ${SHARED_BY_COLUMNS} FROM notes n ${SHARED_BY_JOIN} WHERE n.code = ? AND n.expires_at > ?`,
  )
    .bind(code, Date.now())
    .first<RawNoteRow>();
  return rowToNote(row);
}

async function addNoteToRoom(env: Env, note: NoteRow, roomId: string, source: "mine" | "received"): Promise<void> {
  if (!note || isExpired(note)) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO network_notes (room_id, note_id, source, added_at) VALUES (?, ?, ?, ?)",
  )
    .bind(roomId, note.id, source === "received" ? "received" : "mine", Date.now())
    .run();
}

async function createUniqueShareCode(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomShareCode(CONFIG.SHARE_CODE_LENGTH);
    const existing = await env.DB.prepare("SELECT 1 AS found FROM notes WHERE code = ?").bind(code).first();
    if (!existing) return code;
  }
  throw new Error("Unable to generate a unique share code.");
}

function publicItemPayload(note: NoteRow, includeText: boolean) {
  return {
    ok: true,
    item: {
      id: note.id,
      title: note.title,
      locked: Boolean(note.locked),
      code: note.code,
      createdAt: Number(note.createdAt),
      expiresAt: Number(note.expiresAt),
      ...(note.sharedBy ? { sharedBy: note.sharedBy } : {}),
      ...(includeText ? { text: note.text } : {}),
    },
  };
}

async function verifyPin(request: Request, env: Env, note: NoteRow): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!note.locked) return { ok: true };
  const settings = await getSiteSettings(env);
  const body = await readJsonBody<{ pin?: string }>(request, 2_000);
  if (!body.ok) return { ok: false, response: body.response };
  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";
  if (!pin) return { ok: false, response: jsonError("PIN is required.", 400, "PIN_REQUIRED") };

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await enforceCooldown(env, `unlock:${clientHash}:${note.id}`, settings.unlockCooldownSeconds);
  if (!rateResult.allowed) {
    return {
      ok: false,
      response: jsonError(
        `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} and try again.`,
        429,
        "UNLOCK_RATE_LIMIT",
        { "retry-after": String(rateResult.retryAfter) },
      ),
    };
  }
  const suppliedHash = await hashPin(env.APP_SECRET, note.pinSalt || "", pin);
  if (!constantTimeEqual(suppliedHash, note.pinHash)) {
    await recordEvent(env, request, "pin_failed");
    return { ok: false, response: jsonError("Incorrect PIN.", 401, "WRONG_PIN") };
  }
  return { ok: true };
}

export const notesRoutes = new Hono<{ Bindings: Env }>();

notesRoutes.get("/api/local/items", async (c) => {
  const settings = await getSiteSettings(c.env);
  const roomId = await getRoomId(c.req.raw, c.env.APP_SECRET);
  const result = await c.env.DB.prepare(
    `SELECT n.id, n.title, n.locked, n.code, n.created_at, n.expires_at,
            nn.added_at, nn.source, ${SHARED_BY_COLUMNS}
     FROM network_notes nn
     JOIN notes n ON n.id = nn.note_id
     ${SHARED_BY_JOIN}
     WHERE nn.room_id = ? AND n.expires_at > ?
     ORDER BY nn.added_at DESC
     LIMIT ?`,
  )
    .bind(roomId, Date.now(), settings.maxLocalItems)
    .all<{
      id: string; title: string; locked: number; code: string; created_at: number; expires_at: number;
      added_at: number; source: string; shared_by_name: string | null; shared_by_role: string | null; shared_by_rank: number | null;
    }>();

  return jsonResponse({
    ok: true,
    items: (result.results || []).map((row) => ({
      id: String(row.id),
      title: String(row.title || "Untitled"),
      locked: Boolean(row.locked),
      code: String(row.code || ""),
      createdAt: Number(row.created_at || 0),
      addedAt: Number(row.added_at || row.created_at || 0),
      expiresAt: Number(row.expires_at || 0),
      source: row.source === "received" ? "received" : "mine",
      ...(row.shared_by_name
        ? { sharedBy: { name: row.shared_by_name, role: row.shared_by_role || "", rank: Number(row.shared_by_rank) } }
        : {}),
    })),
    expiresAfterSeconds: settings.ttlSeconds,
    networkNotice: "The available board is grouped by a private hash of the public IP address visible to Cloudflare.",
  });
});

notesRoutes.post("/api/items", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings = await getSiteSettings(env);
  if (settings.maintenanceMode || !settings.notesEnabled || !settings.createSectionEnabled) {
    return jsonError("New notes are temporarily unavailable.", 503, "NOTES_DISABLED");
  }

  const user = await getAuthenticatedUser(c.req.raw, env);
  const limits = await getEffectiveLimits(env, user);

  const body = await readJsonBody<{ title?: string; text?: string; locked?: boolean; pin?: string }>(
    c.req.raw,
    Math.max(24_000, limits.maxTextLength + 2_000),
  );
  if (!body.ok) return body.response;
  const title = normalizeTitle(body.data.title);
  const text = normalizeText(body.data.text);
  const wantsLock = settings.pinEnabled && Boolean(body.data.locked);
  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";

  if (!title) return jsonError("Please enter a title.", 400, "TITLE_REQUIRED");
  if (title.length > settings.maxTitleLength) {
    return jsonError(`Title must be ${settings.maxTitleLength} characters or fewer.`, 400, "TITLE_TOO_LONG");
  }
  if (!text) return jsonError("Please enter text to share.", 400, "TEXT_REQUIRED");
  if (text.length > limits.maxTextLength) {
    return jsonError(`Text must be ${limits.maxTextLength.toLocaleString()} characters or fewer.`, 400, "TEXT_TOO_LONG");
  }
  if (wantsLock && (pin.length < CONFIG.MIN_PIN_LENGTH || pin.length > CONFIG.MAX_PIN_LENGTH)) {
    return jsonError(
      `PIN must be between ${CONFIG.MIN_PIN_LENGTH} and ${CONFIG.MAX_PIN_LENGTH} characters.`,
      400,
      "INVALID_PIN_LENGTH",
    );
  }

  const clientHash = await getClientIpHash(c.req.raw, env.APP_SECRET);
  const rateResult = await enforceCooldown(env, `create:${clientHash}`, settings.createCooldownSeconds);
  if (!rateResult.allowed) {
    return jsonError(
      `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} before creating another note.`,
      429,
      "CREATE_RATE_LIMIT",
      { "retry-after": String(rateResult.retryAfter) },
    );
  }

  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const id = randomBase64Url(16);
  const code = await createUniqueShareCode(env);
  const deleteToken = randomBase64Url(32);
  const deleteTokenHash = await hmacHex(env.APP_SECRET, `delete:${deleteToken}`);
  const createdAt = Date.now();
  const expiresAt = createdAt + limits.ttlSeconds * 1000;
  let pinSalt: string | null = null;
  let pinHash: string | null = null;
  if (wantsLock) {
    pinSalt = randomBase64Url(18);
    pinHash = await hashPin(env.APP_SECRET, pinSalt, pin);
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO notes (
        id, room_id, title, body, locked, pin_salt, pin_hash, code,
        delete_token_hash, created_at, expires_at, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, roomId, title, text, wantsLock ? 1 : 0, pinSalt, pinHash, code, deleteTokenHash, createdAt, expiresAt, user?.id ?? null),
    env.DB.prepare("INSERT INTO network_notes (room_id, note_id, source, added_at) VALUES (?, ?, 'mine', ?)").bind(
      roomId,
      id,
      createdAt,
    ),
  ]);

  await recordEvent(env, c.req.raw, "note_created", { locked: wantsLock });
  return jsonResponse(
    {
      ok: true,
      item: {
        id, title, locked: wantsLock, code, createdAt, addedAt: createdAt, expiresAt, source: "mine",
        ...(user ? { sharedBy: { name: user.displayName, role: user.roleName, rank: user.rank } } : {}),
      },
      deleteToken,
      shareUrl: `${url.origin}/s/${code}`,
      message: `Note created. It will expire automatically in ${formatServerDuration(limits.ttlSeconds)}.`,
    },
    201,
  );
});

notesRoutes.get("/api/local/item/:itemId", async (c) => {
  const env = c.env;
  const itemId = c.req.param("itemId");
  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const row = await env.DB.prepare(
    `SELECT n.*, ${SHARED_BY_COLUMNS} FROM notes n
     JOIN network_notes nn ON nn.note_id = n.id
     ${SHARED_BY_JOIN}
     WHERE n.id = ? AND nn.room_id = ? AND n.expires_at > ?`,
  )
    .bind(itemId, roomId, Date.now())
    .first<RawNoteRow>();
  const note = rowToNote(row);
  if (!note) return jsonError("This note has expired or is not available on this network.", 404, "NOT_FOUND");
  await recordEvent(env, c.req.raw, "note_opened", { via: "network" });
  return jsonResponse(publicItemPayload(note, !note.locked));
});

notesRoutes.post("/api/local/item/:itemId/unlock", async (c) => {
  const env = c.env;
  const itemId = c.req.param("itemId");
  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const row = await env.DB.prepare(
    `SELECT n.*, ${SHARED_BY_COLUMNS} FROM notes n
     JOIN network_notes nn ON nn.note_id = n.id
     ${SHARED_BY_JOIN}
     WHERE n.id = ? AND nn.room_id = ? AND n.expires_at > ?`,
  )
    .bind(itemId, roomId, Date.now())
    .first<RawNoteRow>();
  const note = rowToNote(row);
  if (!note) return jsonError("This note has expired or is not available on this network.", 404, "NOT_FOUND");
  const result = await verifyPin(c.req.raw, env, note);
  if (!result.ok) return result.response;
  await recordEvent(env, c.req.raw, "pin_unlocked", { via: "network" });
  return jsonResponse(publicItemPayload(note, true));
});

notesRoutes.get("/api/share/:code", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings = await getSiteSettings(env);
  const note = await getNoteByCode(env, c.req.param("code"));
  if (!note) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const via = normalizeAccessMethodParam(url);
  if (!note.locked && settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
    await addNoteToRoom(env, note, roomId, constantTimeEqual(roomId, note.roomId) ? "mine" : "received");
  }
  await recordEvent(env, c.req.raw, "shared_note_opened", { via, locked: note.locked });
  return jsonResponse(publicItemPayload(note, !note.locked));
});

notesRoutes.post("/api/share/:code/unlock", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings = await getSiteSettings(env);
  const note = await getNoteByCode(env, c.req.param("code"));
  if (!note) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const result = await verifyPin(c.req.raw, env, note);
  if (!result.ok) return result.response;
  if (settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
    await addNoteToRoom(env, note, roomId, constantTimeEqual(roomId, note.roomId) ? "mine" : "received");
  }
  await recordEvent(env, c.req.raw, "pin_unlocked", { via: normalizeAccessMethodParam(url) });
  return jsonResponse(publicItemPayload(note, true));
});

notesRoutes.delete("/api/item/:itemId", async (c) => {
  const env = c.env;
  const itemId = c.req.param("itemId");
  const note = await getNoteById(env, itemId);
  if (!note) return jsonError("This note has already expired or does not exist.", 404, "NOT_FOUND");
  const body = await readJsonBody<{ deleteToken?: string }>(c.req.raw, 4_000);
  if (!body.ok) return body.response;
  const token = typeof body.data.deleteToken === "string" ? body.data.deleteToken : "";
  if (!token) return jsonError("Delete token is required.", 401, "DELETE_TOKEN_REQUIRED");
  const suppliedHash = await hmacHex(env.APP_SECRET, `delete:${token}`);
  if (!constantTimeEqual(suppliedHash, note.deleteTokenHash)) {
    return jsonError("You can delete this note only from the browser that created it.", 403, "INVALID_DELETE_TOKEN");
  }
  await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(note.id).run();
  await recordEvent(env, c.req.raw, "note_deleted", { by: "creator" });
  return jsonResponse({ ok: true, message: "Note deleted." });
});

function normalizeAccessMethodParam(url: URL): "link" | "code" | "qr" | "network" {
  const value = url.searchParams.get("via");
  return (["link", "code", "qr", "network"] as const).includes(value as never) ? (value as never) : "link";
}

// Exported for admin.ts (admin delete-by-id reuses the same lookup/delete path).
export { getNoteById, getNoteByCode, addNoteToRoom };
