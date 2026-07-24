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
    raw = await request.text();
  } catch {
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
