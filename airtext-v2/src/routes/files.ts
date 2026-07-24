import { Hono } from "hono";
import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { getSiteSettings, type SiteSettings } from "../lib/settings";
import { jsonResponse, jsonError, readJsonBody } from "../lib/http";
import { hmacHex, hashPin, constantTimeEqual, randomBase64Url, randomShareCode } from "../lib/crypto";
import { normalizeTitle, normalizeShareCode, formatServerDuration, isExpired } from "../lib/util";
import { getRoomId, getClientIpHash } from "../middleware/auth";
import { enforceCooldown } from "../middleware/rateLimit";
import { recordEvent } from "../lib/analytics";
import {
  isExtensionAllowed,
  getTotalFileStorageBytes,
  createFileDownloadToken,
  verifyFileDownloadToken,
} from "../lib/r2";

/** Ported from airtext-worker-modern.js:1876-2293 (the live `d1Handle*` file handlers). */

export interface FileRow {
  id: string;
  roomId: string;
  title: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  r2Key: string;
  locked: boolean;
  pinSalt: string | null;
  pinHash: string | null;
  code: string;
  deleteTokenHash: string;
  downloadCount: number;
  createdAt: number;
  expiresAt: number;
}

interface RawFileRow {
  id: string;
  room_id?: string;
  title?: string;
  filename?: string;
  mime?: string;
  size_bytes?: number;
  r2_key?: string;
  locked?: number;
  pin_salt?: string | null;
  pin_hash?: string | null;
  code?: string;
  delete_token_hash?: string;
  download_count?: number;
  created_at?: number;
  expires_at?: number;
}

function rowToFile(row: RawFileRow | null | undefined): FileRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    roomId: String(row.room_id || ""),
    title: String(row.title || "Untitled"),
    filename: String(row.filename || "file"),
    mime: String(row.mime || "application/octet-stream"),
    sizeBytes: Number(row.size_bytes || 0),
    r2Key: String(row.r2_key || ""),
    locked: Boolean(row.locked),
    pinSalt: row.pin_salt ? String(row.pin_salt) : null,
    pinHash: row.pin_hash ? String(row.pin_hash) : null,
    code: String(row.code || ""),
    deleteTokenHash: String(row.delete_token_hash || ""),
    downloadCount: Number(row.download_count || 0),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
  };
}

async function getFileById(env: Env, fileId: string): Promise<FileRow | null> {
  const row = await env.DB.prepare("SELECT * FROM files WHERE id = ? AND expires_at > ?")
    .bind(fileId, Date.now())
    .first<RawFileRow>();
  return rowToFile(row);
}

async function getFileByCode(env: Env, rawCode: string): Promise<FileRow | null> {
  const code = normalizeShareCode(rawCode);
  const row = await env.DB.prepare("SELECT * FROM files WHERE code = ? AND expires_at > ?")
    .bind(code, Date.now())
    .first<RawFileRow>();
  return rowToFile(row);
}

async function addFileToRoom(env: Env, file: FileRow, roomId: string, source: "mine" | "received"): Promise<void> {
  if (!file || isExpired(file)) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO network_files (room_id, file_id, source, added_at) VALUES (?, ?, ?, ?)",
  )
    .bind(roomId, file.id, source === "received" ? "received" : "mine", Date.now())
    .run();
}

async function createUniqueFileShareCode(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomShareCode(CONFIG.SHARE_CODE_LENGTH);
    const existing = await env.DB.prepare("SELECT 1 AS found FROM files WHERE code = ?").bind(code).first();
    if (!existing) return code;
  }
  throw new Error("Unable to generate a unique file share code.");
}

async function verifyFilePin(
  request: Request,
  env: Env,
  file: FileRow,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!file.locked) return { ok: true };
  const settings = await getSiteSettings(env);
  const body = await readJsonBody<{ pin?: string }>(request, 2_000);
  if (!body.ok) return { ok: false, response: body.response };
  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";
  if (!pin) return { ok: false, response: jsonError("PIN is required.", 400, "PIN_REQUIRED") };

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await enforceCooldown(env, `unlock-file:${clientHash}:${file.id}`, settings.unlockCooldownSeconds);
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
  const suppliedHash = await hashPin(env.APP_SECRET, file.pinSalt || "", pin);
  if (!constantTimeEqual(suppliedHash, file.pinHash)) {
    await recordEvent(env, request, "file_pin_failed");
    return { ok: false, response: jsonError("Incorrect PIN.", 401, "WRONG_PIN") };
  }
  return { ok: true };
}

async function publicFilePayload(env: Env, file: FileRow, includeDownload: boolean) {
  let downloadUrl: string | null = null;
  if (includeDownload) {
    const tokenExpiresAt = Date.now() + 5 * 60 * 1000;
    const token = await createFileDownloadToken(env.APP_SECRET, file.id, tokenExpiresAt);
    downloadUrl = `/api/file/${file.id}/download?token=${encodeURIComponent(token)}`;
  }
  return {
    ok: true,
    file: {
      id: file.id,
      title: file.title,
      filename: file.filename,
      mime: file.mime,
      sizeBytes: file.sizeBytes,
      locked: Boolean(file.locked),
      code: file.code,
      downloadCount: file.downloadCount,
      createdAt: Number(file.createdAt),
      expiresAt: Number(file.expiresAt),
      ...(downloadUrl ? { downloadUrl } : {}),
    },
  };
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
  const result = await env.DB.prepare(
    `SELECT f.id, f.title, f.filename, f.mime, f.size_bytes, f.locked, f.code,
            f.created_at, f.expires_at, nf.added_at, nf.source
     FROM network_files nf
     JOIN files f ON f.id = nf.file_id
     WHERE nf.room_id = ? AND f.expires_at > ?
     ORDER BY nf.added_at DESC
     LIMIT ?`,
  )
    .bind(roomId, Date.now(), settings.maxActiveFiles)
    .all<{
      id: string; title: string; filename: string; mime: string; size_bytes: number; locked: number;
      code: string; created_at: number; expires_at: number; added_at: number; source: string;
    }>();

  return jsonResponse({
    ok: true,
    files: (result.results || []).map((row) => ({
      id: String(row.id),
      title: String(row.title || "Untitled"),
      filename: String(row.filename || "file"),
      mime: String(row.mime || "application/octet-stream"),
      sizeBytes: Number(row.size_bytes || 0),
      locked: Boolean(row.locked),
      code: String(row.code || ""),
      createdAt: Number(row.created_at || 0),
      addedAt: Number(row.added_at || row.created_at || 0),
      expiresAt: Number(row.expires_at || 0),
      source: row.source === "received" ? "received" : "mine",
    })),
    expiresAfterSeconds: settings.fileTtlSeconds,
  });
});

filesRoutes.post("/api/files", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings: SiteSettings = await getSiteSettings(env);
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

  const maxBytes = settings.maxFileSizeMB * 1024 * 1024;
  const contentLength = Number(c.req.header("content-length") || 0);
  if (contentLength && contentLength > maxBytes + 200_000) {
    return jsonError(`Files must be ${settings.maxFileSizeMB}MB or smaller.`, 413, "FILE_TOO_LARGE");
  }

  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return jsonError("Could not read the upload. Please try again.", 400, "INVALID_UPLOAD");
  }

  const file = form.get("file");
  if (!file || typeof (file as File).arrayBuffer !== "function") {
    return jsonError("Please choose a file to share.", 400, "FILE_REQUIRED");
  }
  const uploadedFile = file as File;
  if (uploadedFile.size > maxBytes) {
    return jsonError(`Files must be ${settings.maxFileSizeMB}MB or smaller.`, 413, "FILE_TOO_LARGE");
  }
  if (!uploadedFile.size) {
    return jsonError("This file is empty.", 400, "FILE_EMPTY");
  }
  if (!isExtensionAllowed(settings, uploadedFile.name)) {
    return jsonError("This file type is not allowed.", 400, "FILE_TYPE_BLOCKED");
  }

  const totalStored = await getTotalFileStorageBytes(env);
  if (totalStored + uploadedFile.size > settings.maxTotalStorageMB * 1024 * 1024) {
    return jsonError("The site-wide storage limit has been reached. Please try again later.", 507, "STORAGE_LIMIT");
  }

  const titleInput = typeof form.get("title") === "string" ? (form.get("title") as string) : "";
  const title = normalizeTitle(titleInput) || String(uploadedFile.name || "Untitled file").slice(0, settings.maxTitleLength);
  const wantsLock = settings.pinEnabled && form.get("locked") === "1";
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

  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const id = randomBase64Url(16);
  const code = await createUniqueFileShareCode(env);
  const deleteToken = randomBase64Url(32);
  const deleteTokenHash = await hmacHex(env.APP_SECRET, `delete:${deleteToken}`);
  const createdAt = Date.now();
  const expiresAt = createdAt + settings.fileTtlSeconds * 1000;
  const r2Key = `files/${id}`;
  let pinSalt: string | null = null;
  let pinHash: string | null = null;
  if (wantsLock) {
    pinSalt = randomBase64Url(18);
    pinHash = await hashPin(env.APP_SECRET, pinSalt, pin);
  }

  try {
    await env.FILES_BUCKET.put(r2Key, uploadedFile.stream(), {
      httpMetadata: { contentType: uploadedFile.type || "application/octet-stream" },
    });
  } catch (error) {
    console.error("R2 upload failed", error);
    return jsonError("Could not store the file. Please try again.", 502, "STORAGE_WRITE_FAILED");
  }

  const filename = String(uploadedFile.name || "file").slice(0, 255);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO files (
          id, room_id, title, filename, mime, size_bytes, r2_key, locked,
          pin_salt, pin_hash, code, delete_token_hash, download_count, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).bind(
        id, roomId, title, filename, uploadedFile.type || "application/octet-stream",
        uploadedFile.size, r2Key, wantsLock ? 1 : 0, pinSalt, pinHash, code, deleteTokenHash, createdAt, expiresAt,
      ),
      env.DB.prepare("INSERT INTO network_files (room_id, file_id, source, added_at) VALUES (?, ?, 'mine', ?)").bind(
        roomId,
        id,
        createdAt,
      ),
    ]);
  } catch (error) {
    await env.FILES_BUCKET.delete(r2Key).catch(() => {});
    console.error("File metadata write failed", error);
    return jsonError("Could not save the file record. Please try again.", 500, "DB_WRITE_FAILED");
  }

  await recordEvent(env, c.req.raw, "file_created", { locked: wantsLock });
  return jsonResponse(
    {
      ok: true,
      file: {
        id, title, filename, mime: uploadedFile.type || "application/octet-stream", sizeBytes: uploadedFile.size,
        locked: wantsLock, code, createdAt, addedAt: createdAt, expiresAt, source: "mine",
      },
      deleteToken,
      shareUrl: `${url.origin}/f/${code}`,
      message: `File uploaded. It will expire automatically in ${formatServerDuration(settings.fileTtlSeconds)}.`,
    },
    201,
  );
});

filesRoutes.get("/api/local/file/:fileId", async (c) => {
  const env = c.env;
  const fileId = c.req.param("fileId");
  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const row = await env.DB.prepare(
    `SELECT f.* FROM files f
     JOIN network_files nf ON nf.file_id = f.id
     WHERE f.id = ? AND nf.room_id = ? AND f.expires_at > ?`,
  )
    .bind(fileId, roomId, Date.now())
    .first<RawFileRow>();
  const file = rowToFile(row);
  if (!file) return jsonError("This file has expired or is not available on this network.", 404, "NOT_FOUND");
  await recordEvent(env, c.req.raw, "file_opened", { via: "network" });
  return jsonResponse(await publicFilePayload(env, file, !file.locked));
});

filesRoutes.post("/api/local/file/:fileId/unlock", async (c) => {
  const env = c.env;
  const fileId = c.req.param("fileId");
  const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
  const row = await env.DB.prepare(
    `SELECT f.* FROM files f
     JOIN network_files nf ON nf.file_id = f.id
     WHERE f.id = ? AND nf.room_id = ? AND f.expires_at > ?`,
  )
    .bind(fileId, roomId, Date.now())
    .first<RawFileRow>();
  const file = rowToFile(row);
  if (!file) return jsonError("This file has expired or is not available on this network.", 404, "NOT_FOUND");
  const result = await verifyFilePin(c.req.raw, env, file);
  if (!result.ok) return result.response;
  await recordEvent(env, c.req.raw, "file_pin_unlocked", { via: "network" });
  return jsonResponse(await publicFilePayload(env, file, true));
});

filesRoutes.get("/api/share/file/:code", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings = await getSiteSettings(env);
  const file = await getFileByCode(env, c.req.param("code"));
  if (!file) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const via = normalizeAccessMethodParam(url);
  if (!file.locked && settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
    await addFileToRoom(env, file, roomId, constantTimeEqual(roomId, file.roomId) ? "mine" : "received");
  }
  await recordEvent(env, c.req.raw, "shared_file_opened", { via, locked: file.locked });
  return jsonResponse(await publicFilePayload(env, file, !file.locked));
});

filesRoutes.post("/api/share/file/:code/unlock", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const settings = await getSiteSettings(env);
  const file = await getFileByCode(env, c.req.param("code"));
  if (!file) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const result = await verifyFilePin(c.req.raw, env, file);
  if (!result.ok) return result.response;
  if (settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(c.req.raw, env.APP_SECRET);
    await addFileToRoom(env, file, roomId, constantTimeEqual(roomId, file.roomId) ? "mine" : "received");
  }
  await recordEvent(env, c.req.raw, "file_pin_unlocked", { via: normalizeAccessMethodParam(url) });
  return jsonResponse(await publicFilePayload(env, file, true));
});

filesRoutes.get("/api/file/:fileId/download", async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const fileId = c.req.param("fileId");
  if (!env.FILES_BUCKET) {
    return jsonError("File sharing is not configured.", 503, "R2_NOT_CONFIGURED");
  }
  const file = await getFileById(env, fileId);
  if (!file) return jsonError("This file has expired or does not exist.", 404, "NOT_FOUND");
  const token = url.searchParams.get("token") || "";
  const valid = await verifyFileDownloadToken(env.APP_SECRET, file.id, token);
  if (!valid) {
    return jsonError("This download link is invalid or has expired. Reopen the file to try again.", 403, "INVALID_DOWNLOAD_TOKEN");
  }

  const object = await env.FILES_BUCKET.get(file.r2Key);
  if (!object) return jsonError("The file could not be found in storage.", 404, "STORAGE_MISSING");

  await env.DB.prepare("UPDATE files SET download_count = download_count + 1 WHERE id = ?").bind(file.id).run();
  await recordEvent(env, c.req.raw, "file_downloaded");

  const safeName = file.filename.replace(/["\r\n]/g, "");
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": file.mime || "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName}"`,
      "cache-control": "no-store",
      "content-length": String(file.sizeBytes),
    },
  });
});

filesRoutes.delete("/api/file/:fileId", async (c) => {
  const env = c.env;
  const fileId = c.req.param("fileId");
  const file = await getFileById(env, fileId);
  if (!file) return jsonError("This file has already expired or does not exist.", 404, "NOT_FOUND");
  const body = await readJsonBody<{ deleteToken?: string }>(c.req.raw, 4_000);
  if (!body.ok) return body.response;
  const token = typeof body.data.deleteToken === "string" ? body.data.deleteToken : "";
  if (!token) return jsonError("Delete token is required.", 401, "DELETE_TOKEN_REQUIRED");
  const suppliedHash = await hmacHex(env.APP_SECRET, `delete:${token}`);
  if (!constantTimeEqual(suppliedHash, file.deleteTokenHash)) {
    return jsonError("You can delete this file only from the browser that created it.", 403, "INVALID_DELETE_TOKEN");
  }
  await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id).run();
  if (env.FILES_BUCKET) {
    await env.FILES_BUCKET.delete(file.r2Key).catch(() => {});
  }
  await recordEvent(env, c.req.raw, "file_deleted", { by: "creator" });
  return jsonResponse({ ok: true, message: "File deleted." });
});

// Exported for admin.ts (admin delete-by-id reuses the same lookup/delete path).
export { getFileById, getFileByCode };
