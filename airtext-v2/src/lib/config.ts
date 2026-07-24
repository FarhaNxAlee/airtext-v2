/** Ported verbatim from airtext-worker-modern.js:38-45. */
export const CONFIG = Object.freeze({
  MIN_PIN_LENGTH: 4,
  MAX_PIN_LENGTH: 32,
  SHARE_CODE_LENGTH: 6,
  ADMIN_SESSION_SECONDS: 8 * 60 * 60,
  ANALYTICS_RETENTION_SECONDS: 90 * 24 * 60 * 60,
  FEEDBACK_RETENTION_SECONDS: 180 * 24 * 60 * 60,
});
