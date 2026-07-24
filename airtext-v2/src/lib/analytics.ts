import type { Env } from "../types";
import { getSiteSettings } from "./settings";
import { hmacHex, randomBase64Url } from "./crypto";
import { detectDevice, normalizeAccessMethod, getClientIp } from "./util";

/** Ported verbatim from airtext-worker-modern.js:2546-2572. */

export interface RecordEventDetails {
  via?: unknown;
  locked?: boolean;
  category?: string;
  by?: string;
}

export async function recordEvent(
  env: Env,
  request: Request,
  type: string,
  details: RecordEventDetails = {},
): Promise<void> {
  try {
    const settings = await getSiteSettings(env);
    if (!settings.analyticsEnabled) return;
    const at = Date.now();
    const date = new Date(at).toISOString().slice(0, 10);
    const network = (await hmacHex(env.APP_SECRET, `analytics:${date}:${getClientIp(request)}`)).slice(0, 18);
    await env.DB.prepare(
      `INSERT INTO analytics (
        id, type, at, date, network, device, via, locked, category, actor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        randomBase64Url(12),
        String(type).slice(0, 40),
        at,
        date,
        network,
        detectDevice(request.headers.get("user-agent")),
        normalizeAccessMethod(details.via),
        details.locked ? 1 : 0,
        typeof details.category === "string" ? details.category.slice(0, 24) : "",
        typeof details.by === "string" ? details.by.slice(0, 16) : "",
      )
      .run();
  } catch (error) {
    console.warn("D1 analytics write skipped", error);
  }
}
