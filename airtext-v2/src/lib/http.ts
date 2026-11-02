/** Ported verbatim from airtext-worker-modern.js:219-224, 1421-1451. */

export const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate",
  "x-content-type-options": "nosniff",
};

export function jsonResponse(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function jsonError(message: string, status = 400, code = "ERROR", extraHeaders: Record<string, string> = {}): Response {
  return jsonResponse({ ok: false, error: message, code }, status, extraHeaders);
}

export type JsonBodyResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxCharacters: number,
): Promise<JsonBodyResult<T>> {
  let raw: string;
  try {
    raw = new TextDecoder().decode(await readBoundedBytes(request, maxCharacters * 4));
  } catch (error) {
    if (error instanceof BodyLimitError) return { ok: false, response: jsonError("Request body is too large.", 413, "BODY_TOO_LARGE") };
    return { ok: false, response: jsonError("Unable to read request body.", 400, "INVALID_BODY") };
  }

  if (raw.length > maxCharacters) {
    return { ok: false, response: jsonError("Request body is too large.", 413, "BODY_TOO_LARGE") };
  }

  try {
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid object");
    return { ok: true, data };
  } catch {
    return { ok: false, response: jsonError("Request body must be valid JSON.", 400, "INVALID_JSON") };
  }
}

class BodyLimitError extends Error {}
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

export async function readBoundedBytes(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > limit) throw new BodyLimitError();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new BodyLimitError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readMultipartBody(request: Request): Promise<{ok:true;data:FormData} | {ok:false;response:Response}> {
  try {
    // Bounded before multipart parsing. Upload limits deliberately fit this buffer.
    const bytes = await readBoundedBytes(request, MAX_UPLOAD_BYTES);
    const data = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
    return {ok:true,data};
  } catch (error) {
    return {ok:false,response:jsonError(error instanceof BodyLimitError ? "Uploads must be 30 MB or smaller in total." : "Could not read the upload.", error instanceof BodyLimitError ? 413 : 400, error instanceof BodyLimitError ? "BATCH_TOO_LARGE" : "INVALID_UPLOAD")};
  }
}
