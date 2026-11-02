import { Hono } from "hono";
import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { getSiteSettings } from "../lib/settings";
import type { SiteSettings } from "../lib/settings";
import { getEffectiveLimits } from "../lib/limits";
import type { EffectiveLimits } from "../lib/limits";
import { jsonResponse, jsonError, readJsonBody, readMultipartBody } from "../lib/http";
import { hmacHex, hashPin, constantTimeEqual, randomBase64Url, randomShareCode } from "../lib/crypto";
import { normalizeTitle, normalizeShareCode, formatServerDuration, isExpired } from "../lib/util";
import { getRoomId, getClientIpHash, getAuthenticatedUser, isDropOwner } from "../middleware/auth";
import { enforceCooldown } from "../middleware/rateLimit";
import { recordEvent } from "../lib/analytics";
import { deleteObjectsReliably, isExtensionAllowed, getTotalFileStorageBytes, createFileDownloadToken, verifyFileDownloadToken } from "../lib/r2";

/**
 * Phase 5: one share code/link now covers a BATCH of one or more files
 * (a "file group") instead of exactly one file -- see migrations/
 * 0002_file_groups.sql. Every upload, even a single file, creates a
 * group, so there's only one code path.
 */

export interface SharedBy {
  name: string;
  role: string;
  rank: number;
}

export interface FileEntry {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  r2Key: string;
  downloadCount: number;
  consumedAt?: number | null;
}

export interface FileGroupRow {
  id: string;
  roomId: string;
  userId: string | null;
  title: string;
  locked: boolean;
  pinSalt: string | null;
  pinHash: string | null;
  code: string;
  deleteTokenHash: string;
  totalSizeBytes: number;
  burnAfterRead: boolean;
  createdAt: number;
  expiresAt: number;
  sharedBy: SharedBy | null;
}

interface RawGroupRow {
  id: string;
  room_id?: string;
  user_id?: string | null;
  title?: string;
  locked?: number;
  pin_salt?: string | null;
  pin_hash?: string | null;
  code?: string;
  delete_token_hash?: string;
  total_size_bytes?: number;
  burn_after_read?: number;
  created_at?: number;
  expires_at?: number;
  shared_by_name?: string | null;
  shared_by_role?: string | null;
  shared_by_rank?: number | null;
}

interface RawFileEntryRow {
  id: string;
  filename?: string;
  mime?: string;
  size_bytes?: number;
  r2_key?: string;
  download_count?: number;
  consumed_at?: number | null;
}

const SHARED_BY_JOIN = `LEFT JOIN users u ON u.id = g.user_id LEFT JOIN roles r ON r.id = u.role_id`;
const SHARED_BY_COLUMNS = `u.display_name AS shared_by_name, r.name AS shared_by_role, r.rank AS shared_by_rank`;

function rowToGroup(row: RawGroupRow | null | undefined): FileGroupRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    roomId: String(row.room_id || ""),
    userId: row.user_id || null,
    title: String(row.title || "Untitled"),
    locked: Boolean(row.locked),
    pinSalt: row.pin_salt ? String(row.pin_salt) : null,
    pinHash: row.pin_hash ? String(row.pin_hash) : null,
    code: String(row.code || ""),
    deleteTokenHash: String(row.delete_token_hash || ""),
    totalSizeBytes: Number(row.total_size_bytes || 0),
    burnAfterRead: Boolean(row.burn_after_read),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    sharedBy: row.shared_by_name
      ? { name: String(row.shared_by_name), role: String(row.shared_by_role || ""), rank: Number(row.shared_by_rank) }
      : null,
  };
}

function rowToFileEntry(row: RawFileEntryRow): FileEntry {
  return {
    id: String(row.id),
    filename: String(row.filename || "file"),
    mime: String(row.mime || "application/octet-stream"),
    sizeBytes: Number(row.size_bytes || 0),
    r2Key: String(row.r2_key || ""),
    downloadCount: Number(row.download_count || 0),
    consumedAt: row.consumed_at ?? null,
  };
}

async function getGroupById(env: Env, groupId: string): Promise<FileGroupRow | null> {
  const row = await env.DB.prepare(
    `SELECT g.*, ${SHARED_BY_COLUMNS} FROM file_groups g ${SHARED_BY_JOIN} WHERE g.id = ? AND g.expires_at > ?`,
  )
    .bind(groupId, Date.now())
    .first<RawGroupRow>();
  return rowToGroup(row);
}

async function getGroupByCode(env: Env, rawCode: string): Promise<FileGroupRow | null> {
  const code = normalizeShareCode(rawCode);
  const row = await env.DB.prepare(
    `SELECT g.*, ${SHARED_BY_COLUMNS} FROM file_groups g ${SHARED_BY_JOIN} WHERE g.code = ? AND g.expires_at > ? AND EXISTS (SELECT 1 FROM files f WHERE f.group_id=g.id AND f.consumed_at IS NULL)`,
  )
    .bind(code, Date.now())
    .first<RawGroupRow>();
  return rowToGroup(row);
}

async function getFilesForGroup(env: Env, groupId: string): Promise<FileEntry[]> {
  const result = await env.DB.prepare(
    "SELECT id, filename, mime, size_bytes, r2_key, download_count, consumed_at FROM files WHERE group_id = ? ORDER BY created_at ASC",
  )
    .bind(groupId)
    .all<RawFileEntryRow>();
  return (result.results || []).map(rowToFileEntry);
}

async function getFileEntryById(env: Env, fileId: string): Promise<(FileEntry & { groupId: string }) | null> {
  const row = await env.DB.prepare("SELECT id, group_id, filename, mime, size_bytes, r2_key, download_count, consumed_at FROM files WHERE id = ?")
    .bind(fileId)
    .first<RawFileEntryRow & { group_id: string }>();
  if (!row) return null;
  return { ...rowToFileEntry(row), groupId: String(row.group_id) };
}

async function addGroupToRoom(env: Env, group: FileGroupRow, roomId: string, source: "mine" | "received"): Promise<void> {
  if (!group || isExpired(group) || group.burnAfterRead) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO network_files (room_id, group_id, source, added_at) VALUES (?, ?, ?, ?)",
  )
    .bind(roomId, group.id, source === "received" ? "received" : "mine", Date.now())
    .run();
}

/** Owner-initiated "Share to this network" (unlike addGroupToRoom's automatic,
 *  first-add-only INSERT OR IGNORE): refreshes added_at even if the room
 *  already has this group, so re-sharing after the visibility window has
 *  elapsed (see networkVisibilityTtlSeconds) actually makes it reappear. */
async function publishGroupToRoom(env: Env, group: FileGroupRow, roomId: string, source: "mine" | "received"): Promise<void> {
  if (!group || isExpired(group) || group.burnAfterRead) return;
  await env.DB.prepare(
    `INSERT INTO network_files (room_id, group_id, source, added_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(room_id, group_id) DO UPDATE SET added_at = excluded.added_at, source = excluded.source`,
  )
    .bind(roomId, group.id, source === "received" ? "received" : "mine", Date.now())
    .run();
}

async function createUniqueFileShareCode(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomShareCode(CONFIG.SHARE_CODE_LENGTH);
    const existing = await env.DB.prepare("SELECT 1 AS found FROM file_groups WHERE code = ?").bind(code).first();
    if (!existing) return code;
  }
  throw new Error("Unable to generate a unique file share code.");
}

const VANITY_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

async function reserveCustomFileShareCode(env: Env, requestedCode: string): Promise<string | null> {
  const code = normalizeShareCode(requestedCode);
  if (!VANITY_CODE_PATTERN.test(code)) return null;
  const existing = await env.DB.prepare("SELECT 1 AS found FROM file_groups WHERE code = ?").bind(code).first();
  if (existing) return null;
  return code;
}

async function verifyGroupPin(
  request: Request,
  env: Env,
  group: FileGroupRow,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!group.locked) return { ok: true };
  const settings = await getSiteSettings(env);
  const body = await readJsonBody<{ pin?: string }>(request, 2_000);
  if (!body.ok) return { ok: false, response: body.response };
  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";
  if (!pin) return { ok: false, response: jsonError("PIN is required.", 400, "PIN_REQUIRED") };

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await enforceCooldown(env, `unlock-file:${clientHash}:${group.id}`, settings.unlockCooldownSeconds);
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
  const suppliedHash = await hashPin(env.APP_SECRET, group.pinSalt || "", pin);
  if (!constantTimeEqual(suppliedHash, group.pinHash)) {
    await recordEvent(env, request, "file_pin_failed");
    return { ok: false, response: jsonError("Incorrect PIN.", 401, "WRONG_PIN") };
  }
  return { ok: true };
}

async function publicGroupPayload(env: Env, group: FileGroupRow, files: FileEntry[], includeDownload: boolean, owner = false) {
  const filePayloads = await Promise.all(
    files.filter((file) => !file.consumedAt).map(async (file) => {
      let downloadUrl: string | null = null;
      if (includeDownload) {
        const tokenExpiresAt = Date.now() + 5 * 60 * 1000;
        const token = await createFileDownloadToken(env.APP_SECRET, file.id, tokenExpiresAt, owner);
        downloadUrl = `/api/file/${file.id}/download?token=${encodeURIComponent(token)}${owner ? "&owner=1" : ""}`;
      }
      return {
        id: file.id,
        filename: file.filename,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        downloadCount: file.downloadCount,
        ...(downloadUrl ? { downloadUrl } : {}),
      };
    }),
  );
  return {
    ok: true,
    group: {
      id: group.id,
      title: group.title,
      locked: Boolean(group.locked),
      code: group.code,
      totalSizeBytes: group.totalSizeBytes,
      fileCount: filePayloads.length,
      createdAt: Number(group.createdAt),
      expiresAt: Number(group.expiresAt),
      burnAfterRead: Boolean(group.burnAfterRead),
      ...(group.sharedBy ? { sharedBy: group.sharedBy } : {}),
      files: filePayloads,
      isOwner: owner,
    },
  };
}

/** Shared mutation core for all three edit-in-place tiers (anonymous
 *  delete-token, owner, admin) -- each route only differs in how it
 *  authorizes access to `group`, then delegates here. Mirrors POST
 *  /api/files' validation exactly, but sizes/counts are computed relative
 *  to the current group (existing - removed + added), not from zero.
 *  code and delete_token_hash are never touched. */
async function applyFileGroupEdit(
  env: Env,
  group: FileGroupRow,
  existingFiles: FileEntry[],
  form: FormData,
  limits: EffectiveLimits,
  settings: SiteSettings,
): Promise<{ ok: true; group: FileGroupRow; files: FileEntry[] } | { ok: false; response: Response }> {
  let title = group.title;
  const titleRaw = form.get("title");
  if (typeof titleRaw === "string" && titleRaw.trim()) {
    const normalized = normalizeTitle(titleRaw);
    if (normalized.length > settings.maxTitleLength) {
      return { ok: false, response: jsonError(`Title must be ${settings.maxTitleLength} characters or fewer.`, 400, "TITLE_TOO_LONG") };
    }
    title = normalized;
  }

  let locked = group.locked;
  let pinSalt = group.pinSalt;
  let pinHash = group.pinHash;
  const lockedRaw = form.get("locked");
  if (lockedRaw !== null) {
    const wantsLock = settings.pinEnabled && lockedRaw === "1";
    if (!wantsLock) {
      locked = false;
      pinSalt = null;
      pinHash = null;
    } else {
      const pinRaw = form.get("pin");
      const pin = typeof pinRaw === "string" ? pinRaw.trim() : "";
      if (pin) {
        if (pin.length < CONFIG.MIN_PIN_LENGTH || pin.length > CONFIG.MAX_PIN_LENGTH) {
          return {
            ok: false,
            response: jsonError(`PIN must be between ${CONFIG.MIN_PIN_LENGTH} and ${CONFIG.MAX_PIN_LENGTH} characters.`, 400, "INVALID_PIN_LENGTH"),
          };
        }
        pinSalt = randomBase64Url(18);
        pinHash = await hashPin(env.APP_SECRET, pinSalt, pin);
        locked = true;
      } else if (locked) {
        // Already locked and no new PIN supplied -- keep the existing PIN untouched.
        locked = true;
      } else {
        return {
          ok: false,
          response: jsonError(`PIN must be between ${CONFIG.MIN_PIN_LENGTH} and ${CONFIG.MAX_PIN_LENGTH} characters.`, 400, "INVALID_PIN_LENGTH"),
        };
      }
    }
  }

  const burnRaw = form.get("burnAfterRead");
  const burnAfterRead = burnRaw !== null ? burnRaw === "1" : group.burnAfterRead;

  let expiresAt = group.expiresAt;
  const ttlRaw = form.get("ttlSeconds");
  if (typeof ttlRaw === "string") {
    const requested = Number(ttlRaw);
    if (Number.isFinite(requested) && requested > 0) {
      expiresAt = Date.now() + Math.min(Math.floor(requested), limits.fileTtlSeconds) * 1000;
    }
  }

  let removeIds: string[] = [];
  const removeFileIdsRaw = form.get("removeFileIds");
  if (typeof removeFileIdsRaw === "string" && removeFileIdsRaw.trim()) {
    try {
      const parsed = JSON.parse(removeFileIdsRaw);
      if (Array.isArray(parsed)) removeIds = parsed.filter((entry): entry is string => typeof entry === "string");
    } catch {
      return { ok: false, response: jsonError("Invalid file removal list.", 400, "INVALID_REMOVE_FILE_IDS") };
    }
  }
  const filesToRemove = existingFiles.filter((file) => removeIds.includes(file.id));
  const remainingFiles = existingFiles.filter((file) => !removeIds.includes(file.id));

  const newUploads = form.getAll("file").filter((entry): entry is File => typeof (entry as File).arrayBuffer === "function");

  if (remainingFiles.length + newUploads.length < 1) {
    return { ok: false, response: jsonError("A share must include at least one file.", 400, "LAST_FILE_REQUIRED") };
  }
  if (remainingFiles.length + newUploads.length > limits.maxFilesPerBatch) {
    return { ok: false, response: jsonError(`You can attach up to ${limits.maxFilesPerBatch} files per share.`, 400, "TOO_MANY_FILES") };
  }

  const maxFileBytes = limits.maxFileSizeMB * 1024 * 1024;
  let addedBytes = 0;
  for (const file of newUploads) {
    if (!file.size) return { ok: false, response: jsonError(`"${file.name}" is empty.`, 400, "FILE_EMPTY") };
    if (file.size > maxFileBytes) {
      return {
        ok: false,
        response: jsonError(`Each file must be ${limits.maxFileSizeMB}MB or smaller ("${file.name}" is too large).`, 413, "FILE_TOO_LARGE"),
      };
    }
    if (!isExtensionAllowed(settings, file.name)) {
      return { ok: false, response: jsonError(`"${file.name}" is not an allowed file type.`, 400, "FILE_TYPE_BLOCKED") };
    }
    addedBytes += file.size;
  }
  const removedBytes = filesToRemove.reduce((sum, file) => sum + file.sizeBytes, 0);
  const resultingGroupBytes = group.totalSizeBytes - removedBytes + addedBytes;
  if (resultingGroupBytes > limits.maxBatchTotalMB * 1024 * 1024) {
    return { ok: false, response: jsonError(`This upload totals more than the ${limits.maxBatchTotalMB}MB batch limit.`, 413, "BATCH_TOO_LARGE") };
  }
  const totalStored = await getTotalFileStorageBytes(env);
  const resultingSiteTotal = totalStored - removedBytes + addedBytes;
  if (resultingSiteTotal > settings.maxTotalStorageMB * 1024 * 1024) {
    return { ok: false, response: jsonError("The site-wide storage limit has been reached. Please try again later.", 507, "STORAGE_LIMIT") };
  }

  const uploaded: { id: string; r2Key: string; filename: string; mime: string; size: number }[] = [];
  try {
    for (const file of newUploads) {
      const fileId = randomBase64Url(16);
      const r2Key = `files/${group.id}/${fileId}`;
      await env.FILES_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
      uploaded.push({
        id: fileId,
        r2Key,
        filename: String(file.name || "file").slice(0, 255),
        mime: file.type || "application/octet-stream",
        size: file.size,
      });
    }
  } catch (error) {
    await deleteObjectsReliably(env, uploaded.map((entry) => entry.r2Key));
    console.error("R2 upload failed", error);
    return { ok: false, response: jsonError("Could not store the files. Please try again.", 502, "STORAGE_WRITE_FAILED") };
  }

  const createdAt = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE file_groups SET title = ?, locked = ?, pin_salt = ?, pin_hash = ?, burn_after_read = ?, expires_at = ?, total_size_bytes = ?
         WHERE id = ?`,
      ).bind(title, locked ? 1 : 0, pinSalt, pinHash, burnAfterRead ? 1 : 0, expiresAt, resultingGroupBytes, group.id),
      ...uploaded.map((entry) =>
        env.DB.prepare(
          `INSERT INTO files (id, group_id, filename, mime, size_bytes, r2_key, download_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        ).bind(entry.id, group.id, entry.filename, entry.mime, entry.size, entry.r2Key, createdAt),
      ),
      env.DB.prepare("INSERT OR IGNORE INTO object_deletions (r2_key,created_at) SELECT r2_key,? FROM files WHERE id IN (SELECT value FROM json_each(?))").bind(Date.now(),JSON.stringify(filesToRemove.map((file) => file.id))),
      ...filesToRemove.map((file) => env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id)),
    ]);
  } catch (error) {
    await deleteObjectsReliably(env, uploaded.map((entry) => entry.r2Key));
    console.error("File metadata write failed", error);
    return { ok: false, response: jsonError("Could not save the file changes. Please try again.", 500, "DB_WRITE_FAILED") };
  }

  if (filesToRemove.length) {
    await deleteObjectsReliably(env, filesToRemove.map((file) => file.r2Key));
  }

  if (burnAfterRead) await env.DB.prepare("DELETE FROM network_files WHERE group_id = ?").bind(group.id).run();
  const updatedGroup: FileGroupRow = { ...group, title, locked, pinSalt, pinHash, burnAfterRead, expiresAt, totalSizeBytes: resultingGroupBytes };
  const updatedFiles: FileEntry[] = [
    ...remainingFiles,
    ...uploaded.map((entry) => ({
      id: entry.id, filename: entry.filename, mime: entry.mime, sizeBytes: entry.size, r2Key: entry.r2Key, downloadCount: 0,
    })),
  ];
  return { ok: true, group: updatedGroup, files: updatedFiles };
}

function normalizeAccessMethodParam(url: URL): "link" | "code" | "qr" | "network" {
  const value = url.searchParams.get("via");
  return (["link", "code", "qr", "network"] as const).includes(value as never) ? (value as never) : "link";
}

export const filesRoutes = new Hono<{ Bindings: Env }>();

filesRoutes.get("/api/local/files", async (c) => {
  const env = c.env;
  const settings = await getSiteSettings(env);
  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const visibilityCutoff = Date.now() - settings.networkVisibilityTtlSeconds * 1000;
  const viewer = await getAuthenticatedUser(c.req.raw, env);
  const result = await env.DB.prepare(
    `SELECT g.user_id, g.id, g.title, g.locked, g.code, g.total_size_bytes, g.created_at, g.expires_at, g.burn_after_read,
            nf.added_at, nf.source, ${SHARED_BY_COLUMNS},
            (SELECT COUNT(*) FROM files WHERE files.group_id = g.id) AS file_count
     FROM network_files nf
     JOIN file_groups g ON g.id = nf.group_id
     ${SHARED_BY_JOIN}
     WHERE nf.room_id = ? AND g.expires_at > ? AND g.burn_after_read = 0 AND nf.added_at > ?
     ORDER BY nf.added_at DESC
     LIMIT ?`,
  )
    .bind(roomId, Date.now(), visibilityCutoff, settings.maxActiveFiles)
    .all<{
      user_id: string | null; id: string; title: string; locked: number; code: string; total_size_bytes: number; created_at: number;
      expires_at: number; burn_after_read: number; added_at: number; source: string; file_count: number;
      shared_by_name: string | null; shared_by_role: string | null; shared_by_rank: number | null;
    }>();

  return jsonResponse({
    ok: true,
    files: (result.results || []).map((row) => ({
      id: String(row.id),
      title: String(row.title || "Untitled"),
      locked: Boolean(row.locked),
      code: String(row.code || ""),
      totalSizeBytes: Number(row.total_size_bytes || 0),
      fileCount: Number(row.file_count || 0),
      createdAt: Number(row.created_at || 0),
      addedAt: Number(row.added_at || row.created_at || 0),
      expiresAt: Number(row.expires_at || 0),
      burnAfterRead: Boolean(row.burn_after_read),
      isOwner: Boolean(viewer && row.user_id === viewer.id),
      source: "nearby",
      ...(row.shared_by_name
        ? { sharedBy: { name: row.shared_by_name, role: row.shared_by_role || "", rank: Number(row.shared_by_rank) } }
        : {}),
    })),
    expiresAfterSeconds: settings.fileTtlSeconds,
  });
});

filesRoutes.post("/api/files", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings = await getSiteSettings(env);
  if (settings.maintenanceMode || !settings.fileSharingEnabled) {
    return jsonError("File sharing is temporarily unavailable.", 503, "FILES_DISABLED");
  }
  if (!env.FILES_BUCKET) {
    return jsonError(
      "File sharing is not configured. Add an R2 bucket binding named FILES_BUCKET in Cloudflare.",
      503,
      "R2_NOT_CONFIGURED",
    );
  }

  const user = await getAuthenticatedUser(c.req.raw, env);
  const limits = await getEffectiveLimits(env, user);

  const maxBatchBytes = limits.maxBatchTotalMB * 1024 * 1024;
  const contentLength = Number(c.req.header("content-length") || 0);
  if (contentLength && contentLength > maxBatchBytes + 200_000) {
    return jsonError(`Uploads must be ${limits.maxBatchTotalMB}MB or smaller in total.`, 413, "BATCH_TOO_LARGE");
  }

  const multipart = await readMultipartBody(c.req.raw);
  if (!multipart.ok) return multipart.response;
  const form = multipart.data;

  const uploadedFiles = form.getAll("file").filter((entry): entry is File => typeof (entry as File).arrayBuffer === "function");
  if (!uploadedFiles.length) return jsonError("Please choose at least one file to share.", 400, "FILE_REQUIRED");
  if (uploadedFiles.length > limits.maxFilesPerBatch) {
    return jsonError(`You can attach up to ${limits.maxFilesPerBatch} files per share.`, 400, "TOO_MANY_FILES");
  }

  const maxFileBytes = limits.maxFileSizeMB * 1024 * 1024;
  let batchBytes = 0;
  for (const uploadedFile of uploadedFiles) {
    if (!uploadedFile.size) return jsonError(`"${uploadedFile.name}" is empty.`, 400, "FILE_EMPTY");
    if (uploadedFile.size > maxFileBytes) {
      return jsonError(`Each file must be ${limits.maxFileSizeMB}MB or smaller ("${uploadedFile.name}" is too large).`, 413, "FILE_TOO_LARGE");
    }
    if (!isExtensionAllowed(settings, uploadedFile.name)) {
      return jsonError(`"${uploadedFile.name}" is not an allowed file type.`, 400, "FILE_TYPE_BLOCKED");
    }
    batchBytes += uploadedFile.size;
  }
  if (batchBytes > maxBatchBytes) {
    return jsonError(`This upload totals more than the ${limits.maxBatchTotalMB}MB batch limit.`, 413, "BATCH_TOO_LARGE");
  }

  const totalStored = await getTotalFileStorageBytes(env);
  if (totalStored + batchBytes > settings.maxTotalStorageMB * 1024 * 1024) {
    return jsonError("The site-wide storage limit has been reached. Please try again later.", 507, "STORAGE_LIMIT");
  }

  const titleInput = typeof form.get("title") === "string" ? (form.get("title") as string) : "";
  const title = normalizeTitle(titleInput) || String(uploadedFiles[0].name || "Untitled file").slice(0, settings.maxTitleLength);
  const wantsLock = settings.pinEnabled && form.get("locked") === "1";
  const wantsBurnAfterRead = form.get("burnAfterRead") === "1";
  const pinRaw = form.get("pin");
  const pin = typeof pinRaw === "string" ? pinRaw.trim() : "";
  if (title.length > settings.maxTitleLength) {
    return jsonError(`Title must be ${settings.maxTitleLength} characters or fewer.`, 400, "TITLE_TOO_LONG");
  }
  if (wantsLock && (pin.length < CONFIG.MIN_PIN_LENGTH || pin.length > CONFIG.MAX_PIN_LENGTH)) {
    return jsonError(
      `PIN must be between ${CONFIG.MIN_PIN_LENGTH} and ${CONFIG.MAX_PIN_LENGTH} characters.`,
      400,
      "INVALID_PIN_LENGTH",
    );
  }

  const clientHash = await getClientIpHash(c.req.raw, env.APP_SECRET);
  const rateResult = await enforceCooldown(env, `create-file:${clientHash}`, settings.fileUploadCooldownSeconds);
  if (!rateResult.allowed) {
    return jsonError(
      `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} before uploading another file.`,
      429,
      "CREATE_RATE_LIMIT",
      { "retry-after": String(rateResult.retryAfter) },
    );
  }

  let code: string;
  const customCodeRaw = form.get("customCode");
  if (limits.allowCustomCode && typeof customCodeRaw === "string" && customCodeRaw.trim()) {
    const reserved = await reserveCustomFileShareCode(env, customCodeRaw);
    if (!reserved) {
      return jsonError("That code is already taken or invalid (4-12 letters/numbers).", 409, "CODE_TAKEN");
    }
    code = reserved;
  } else {
    code = await createUniqueFileShareCode(env);
  }

  // Phase 7 expiry chooser (V3-PLAN.md section 9): optional client-picked
  // TTL override, clamped to the caller's effective limit -- omitted or
  // invalid keeps today's default of the full effective fileTtlSeconds.
  const requestedTtlSecondsRaw = form.get("ttlSeconds");
  const requestedTtlSeconds = Number(requestedTtlSecondsRaw);
  const effectiveTtlSeconds = typeof requestedTtlSecondsRaw === "string" && Number.isFinite(requestedTtlSeconds) && requestedTtlSeconds > 0
    ? Math.min(Math.floor(requestedTtlSeconds), limits.fileTtlSeconds)
    : limits.fileTtlSeconds;

  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const groupId = randomBase64Url(16);
  const deleteToken = randomBase64Url(32);
  const deleteTokenHash = await hmacHex(env.APP_SECRET, `delete:${deleteToken}`);
  const createdAt = Date.now();
  const expiresAt = createdAt + effectiveTtlSeconds * 1000;
  let pinSalt: string | null = null;
  let pinHash: string | null = null;
  if (wantsLock) {
    pinSalt = randomBase64Url(18);
    pinHash = await hashPin(env.APP_SECRET, pinSalt, pin);
  }

  const uploaded: { id: string; r2Key: string; filename: string; mime: string; size: number }[] = [];
  try {
    for (const uploadedFile of uploadedFiles) {
      const fileId = randomBase64Url(16);
      const r2Key = `files/${groupId}/${fileId}`;
      await env.FILES_BUCKET.put(r2Key, uploadedFile.stream(), {
        httpMetadata: { contentType: uploadedFile.type || "application/octet-stream" },
      });
      uploaded.push({
        id: fileId,
        r2Key,
        filename: String(uploadedFile.name || "file").slice(0, 255),
        mime: uploadedFile.type || "application/octet-stream",
        size: uploadedFile.size,
      });
    }
  } catch (error) {
    await deleteObjectsReliably(env, uploaded.map((entry) => entry.r2Key));
    console.error("R2 upload failed", error);
    return jsonError("Could not store the files. Please try again.", 502, "STORAGE_WRITE_FAILED");
  }

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO file_groups (
          id, room_id, user_id, title, locked, pin_salt, pin_hash, code,
          delete_token_hash, total_size_bytes, created_at, expires_at, burn_after_read
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        groupId, roomId, user?.id ?? null, title, wantsLock ? 1 : 0, pinSalt, pinHash, code, deleteTokenHash,
        batchBytes, createdAt, expiresAt, wantsBurnAfterRead ? 1 : 0,
      ),
      ...uploaded.map((entry) =>
        env.DB.prepare(
          `INSERT INTO files (id, group_id, filename, mime, size_bytes, r2_key, download_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        ).bind(entry.id, groupId, entry.filename, entry.mime, entry.size, entry.r2Key, createdAt),
      ),
      ...(!wantsBurnAfterRead ? [env.DB.prepare("INSERT INTO network_files (room_id, group_id, source, added_at) VALUES (?, ?, 'mine', ?)").bind(
        roomId,
        groupId,
        createdAt,
      )] : []),
    ]);
  } catch (error) {
    await deleteObjectsReliably(env, uploaded.map((entry) => entry.r2Key));
    console.error("File metadata write failed", error);
    return jsonError("Could not save the file record. Please try again.", 500, "DB_WRITE_FAILED");
  }

  await recordEvent(env, c.req.raw, "file_created", { locked: wantsLock });
  return jsonResponse(
    {
      ok: true,
      group: {
        id: groupId, title, locked: wantsLock, burnAfterRead: wantsBurnAfterRead, code, createdAt, addedAt: createdAt, expiresAt, source: "mine",
        totalSizeBytes: batchBytes,
        fileCount: uploaded.length,
        files: uploaded.map((entry) => ({ id: entry.id, filename: entry.filename, mime: entry.mime, sizeBytes: entry.size })),
        ...(user ? { sharedBy: { name: user.displayName, role: user.roleName, rank: user.rank } } : {}),
      },
      deleteToken,
      shareUrl: `${url.origin}/f/${code}`,
      message: `File${uploaded.length === 1 ? "" : "s"} uploaded. Will expire automatically in ${formatServerDuration(effectiveTtlSeconds)}.`,
    },
    201,
  );
});

filesRoutes.get("/api/local/file/:groupId", async (c) => {
  const env = c.env;
  const groupId = c.req.param("groupId");
  const settings = await getSiteSettings(env);
  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const row = await env.DB.prepare(
    `SELECT g.*, ${SHARED_BY_COLUMNS} FROM file_groups g
     JOIN network_files nf ON nf.group_id = g.id
     ${SHARED_BY_JOIN}
     WHERE g.id = ? AND nf.room_id = ? AND g.expires_at > ? AND g.burn_after_read = 0 AND nf.added_at > ?`,
  )
    .bind(groupId, roomId, Date.now(), Date.now() - settings.networkVisibilityTtlSeconds * 1000)
    .first<RawGroupRow>();
  const group = rowToGroup(row);
  if (!group) return jsonError("This file has expired or is not available on this network.", 404, "NOT_FOUND");
  const files = await getFilesForGroup(env, group.id);
  await recordEvent(env, c.req.raw, "file_opened", { via: "network" });
  return jsonResponse(await publicGroupPayload(env, group, files, !group.locked, await isDropOwner(c.req.raw, env, group.userId, group.deleteTokenHash)));
});

filesRoutes.post("/api/local/file/:groupId/unlock", async (c) => {
  const env = c.env;
  const groupId = c.req.param("groupId");
  const settings = await getSiteSettings(env);
  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const row = await env.DB.prepare(
    `SELECT g.*, ${SHARED_BY_COLUMNS} FROM file_groups g
     JOIN network_files nf ON nf.group_id = g.id
     ${SHARED_BY_JOIN}
     WHERE g.id = ? AND nf.room_id = ? AND g.expires_at > ? AND g.burn_after_read = 0 AND nf.added_at > ?`,
  )
    .bind(groupId, roomId, Date.now(), Date.now() - settings.networkVisibilityTtlSeconds * 1000)
    .first<RawGroupRow>();
  const group = rowToGroup(row);
  if (!group) return jsonError("This file has expired or is not available on this network.", 404, "NOT_FOUND");
  const result = await verifyGroupPin(c.req.raw, env, group);
  if (!result.ok) return result.response;
  const files = await getFilesForGroup(env, group.id);
  await recordEvent(env, c.req.raw, "file_pin_unlocked", { via: "network" });
  return jsonResponse(await publicGroupPayload(env, group, files, true, await isDropOwner(c.req.raw, env, group.userId, group.deleteTokenHash)));
});

filesRoutes.get("/api/share/file/:code", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings = await getSiteSettings(env);
  const group = await getGroupByCode(env, c.req.param("code"));
  if (!group) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const via = normalizeAccessMethodParam(url);
  if (!group.locked && !group.burnAfterRead && settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
    await addGroupToRoom(env, group, roomId, constantTimeEqual(roomId, group.roomId) ? "mine" : "received");
  }
  const files = await getFilesForGroup(env, group.id);
  await recordEvent(env, c.req.raw, "shared_file_opened", { via, locked: group.locked });
  return jsonResponse(await publicGroupPayload(env, group, files, !group.locked, await isDropOwner(c.req.raw, env, group.userId, group.deleteTokenHash)));
});

filesRoutes.post("/api/share/file/:code/unlock", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings = await getSiteSettings(env);
  const group = await getGroupByCode(env, c.req.param("code"));
  if (!group) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const result = await verifyGroupPin(c.req.raw, env, group);
  if (!result.ok) return result.response;
  if (!group.burnAfterRead && settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
    await addGroupToRoom(env, group, roomId, constantTimeEqual(roomId, group.roomId) ? "mine" : "received");
  }
  const files = await getFilesForGroup(env, group.id);
  await recordEvent(env, c.req.raw, "file_pin_unlocked", { via: normalizeAccessMethodParam(url) });
  return jsonResponse(await publicGroupPayload(env, group, files, true, await isDropOwner(c.req.raw, env, group.userId, group.deleteTokenHash)));
});

filesRoutes.get("/api/file/:fileId/download", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const fileId = c.req.param("fileId");
  if (!env.FILES_BUCKET) {
    return jsonError("File sharing is not configured.", 503, "R2_NOT_CONFIGURED");
  }
  const entry = await getFileEntryById(env, fileId);
  if (!entry) return jsonError("This file has expired or does not exist.", 404, "NOT_FOUND");
  const group = await getGroupById(env, entry.groupId);
  if (!group) return jsonError("This file has expired or does not exist.", 404, "NOT_FOUND");

  const token = url.searchParams.get("token") || "";
  const ownerDownload = url.searchParams.get("owner") === "1";
  const valid = await verifyFileDownloadToken(env.APP_SECRET, entry.id, token, ownerDownload);
  if (!valid) {
    return jsonError("This download link is invalid or has expired. Reopen the file to try again.", 403, "INVALID_DOWNLOAD_TOKEN");
  }

  const object = await env.FILES_BUCKET.get(entry.r2Key);
  if (!object) return jsonError("The file could not be found in storage.", 404, "STORAGE_MISSING");

  await env.DB.prepare("UPDATE files SET download_count = download_count + 1 WHERE id = ?").bind(entry.id).run();
  await recordEvent(env, c.req.raw, "file_downloaded");

  const safeName = entry.filename.replace(/["\r\n]/g, "");

  // Claim each file once atomically. Owners use a separately signed capability.
  // Streaming keeps large downloads out of the Worker's JavaScript heap.
  if (entry.consumedAt) return jsonError("This file has already been downloaded.", 404, "NOT_FOUND");
  if (group.burnAfterRead && !ownerDownload) {
    const claimed = await env.DB.prepare("UPDATE files SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL RETURNING id").bind(Date.now(), entry.id).first();
    if (!claimed) return jsonError("This file has already been downloaded.", 404, "NOT_FOUND");
    const reader = object.body.getReader();
    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      await deleteObjectsReliably(env, [entry.r2Key]);
    };
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) { await finish(); controller.close(); }
          else controller.enqueue(next.value);
        } catch (error) { await finish(); controller.error(error); }
      },
      async cancel(reason) { await reader.cancel(reason); await finish(); },
    });
    return new Response(stream, { headers: {
      "content-type": entry.mime || "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName}"`,
      "cache-control": "no-store", "x-content-type-options": "nosniff",
    } });
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": entry.mime || "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName}"`,
      "cache-control": "no-store",
      "content-length": String(entry.sizeBytes),
    },
  });
});

filesRoutes.delete("/api/file/:groupId", async (c) => {
  const env = c.env;
  const groupId = c.req.param("groupId");
  const group = await getGroupById(env, groupId);
  if (!group) return jsonError("This file has already expired or does not exist.", 404, "NOT_FOUND");
  const body = await readJsonBody<{ deleteToken?: string }>(c.req.raw, 4_000);
  if (!body.ok) return body.response;
  const token = typeof body.data.deleteToken === "string" ? body.data.deleteToken : "";
  if (!token) return jsonError("Delete token is required.", 401, "DELETE_TOKEN_REQUIRED");
  const suppliedHash = await hmacHex(env.APP_SECRET, `delete:${token}`);
  if (!constantTimeEqual(suppliedHash, group.deleteTokenHash)) {
    return jsonError("You can delete this file only from the browser that created it.", 403, "INVALID_DELETE_TOKEN");
  }
  await deleteGroupAndFiles(env, group.id);
  await recordEvent(env, c.req.raw, "file_deleted", { by: "creator" });
  return jsonResponse({ ok: true, message: "File deleted." });
});

filesRoutes.get("/api/file/:groupId", async (c) => {
  const group = await getGroupById(c.env, c.req.param("groupId"));
  if (!group || !await isDropOwner(c.req.raw, c.env, group.userId, group.deleteTokenHash)) return jsonError("Drop not found.", 404, "NOT_FOUND");
  return jsonResponse(await publicGroupPayload(c.env, group, await getFilesForGroup(c.env, group.id), true, true));
});

filesRoutes.patch("/api/file/:groupId", async (c) => {
  const env = c.env;
  const groupId = c.req.param("groupId");
  const group = await getGroupById(env, groupId);
  if (!group) return jsonError("This file has already expired or does not exist.", 404, "NOT_FOUND");
  const multipart = await readMultipartBody(c.req.raw);
  if (!multipart.ok) return multipart.response;
  const form = multipart.data;
  const token = typeof form.get("deleteToken") === "string" ? (form.get("deleteToken") as string) : "";
  if (!token) return jsonError("Delete token is required.", 401, "DELETE_TOKEN_REQUIRED");
  const suppliedHash = await hmacHex(env.APP_SECRET, `delete:${token}`);
  if (!constantTimeEqual(suppliedHash, group.deleteTokenHash)) {
    return jsonError("You can edit this file only from the browser that created it.", 403, "INVALID_DELETE_TOKEN");
  }
  const settings = await getSiteSettings(env);
  const requester = await getAuthenticatedUser(c.req.raw, env);
  const limits = await getEffectiveLimits(env, requester);
  const existingFiles = await getFilesForGroup(env, group.id);
  const result = await applyFileGroupEdit(env, group, existingFiles, form, limits, settings);
  if (!result.ok) return result.response;
  await recordEvent(env, c.req.raw, "file_edited", { by: "creator" });
  return jsonResponse({ ...(await publicGroupPayload(env, result.group, result.files, true, true)), message: "File updated." });
});

async function deleteGroupAndFiles(env: Env, groupId: string): Promise<void> {
  const files = await getFilesForGroup(env, groupId);
  // Persist a retry path in the same transaction that removes metadata.
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO object_deletions (r2_key, created_at) SELECT r2_key, ? FROM files WHERE group_id = ?").bind(Date.now(), groupId),
    env.DB.prepare("DELETE FROM files WHERE group_id = ?").bind(groupId),
    env.DB.prepare("DELETE FROM file_groups WHERE id = ?").bind(groupId),
  ]);
  await deleteObjectsReliably(env, files.map((file) => file.r2Key));
}

// Exported for admin.ts (admin delete-by-id reuses the same lookup/delete path).
export { getGroupById, getGroupByCode, deleteGroupAndFiles, publishGroupToRoom, applyFileGroupEdit, getFilesForGroup, publicGroupPayload };
