import { escapeHtml, safeJsonForScript } from "./lib/util";
import type { SiteSettings } from "./lib/settings";
import type { EffectiveLimits } from "./lib/limits";

/**
 * V3 Phase 2b+3 (see V3-PLAN.md sections 0.3, 1, 3.2, 3): real server-rendered
 * routes sharing one shell, instead of one HTML document containing every
 * app section at once. Ported from airtext-worker-modern.js APP_HTML
 * (:2728-6255) originally, then restructured here into:
 *   - ICON_SPRITE + a handful of static shared-shell pieces (header, footer,
 *     drawer, modals) used by every *public* route
 *   - one page-content function per public route (home/text/files/nearby/
 *     receive/qr/guide/faq/about/privacy/terms/login)
 *   - ACCOUNT_APP_SECTION / ADMIN_APP_SECTION, unchanged structurally --
 *     still full sections toggled by initialAdmin/initialAccount boot flags
 * renderPage() composes all of this into one document per request. `/`,
 * `/s/:code`, `/f/:code`, `/admin` and `/account` all keep rendering exactly
 * the content they did before (home content = hero+tabs+create+notes+join+
 * files, byte-for-byte the same markup, just factored into pageHomeContent()).
 */

/* ------------------------------------------------------------------ */
/* Icon sprite -- one <symbol> sheet, referenced everywhere via <use>. */
/* ------------------------------------------------------------------ */

const ICON_SPRITE = `<svg style="display:none" aria-hidden="true" focusable="false">
  <symbol id="i-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h6"/></symbol>
  <symbol id="i-theme" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
  <symbol id="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></symbol>
  <symbol id="i-arrow-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="i-arrow-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></symbol>
  <symbol id="i-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v5M12 16v5M4.2 7.5l4.3 2.5M15.5 14l4.3 2.5M4.2 16.5 8.5 14M15.5 10l4.3-2.5"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></symbol>
  <symbol id="i-qr-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h.01M17 7h.01M7 17h.01"/><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-2zM14 18h2v2h-2z"/></symbol>
  <symbol id="i-wifi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M12 20h.01"/></symbol>
</svg>`;

/* ------------------------------------------------------------------ */
/* Shared shell pieces (every *public* route: home + the 11 new routes) */
/* ------------------------------------------------------------------ */

const SITE_HEADER = String.raw`<header class="site-header sticky top-0 z-40 border-b backdrop-blur-xl">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-7">
      <a href="/" class="flex items-center gap-3" aria-label="__APP_NAME__ home">
        <span class="site-logo brand-mark grid h-10 w-10 place-items-center text-white">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-logo"></use></svg>
        </span>
        <span class="site-wordmark text-xl font-bold tracking-[-.04em]">__APP_NAME__</span>
      </a>

      <nav class="flex items-center gap-1 text-sm" aria-label="Primary navigation">
        <details class="nav-dropdown desktop-nav-item relative">
          <summary class="flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-2 text-slate-400 transition hover:text-white [&::-webkit-details-marker]:hidden">
            Send
            <svg viewBox="0 0 24 24" class="h-3 w-3 opacity-70"><use href="#i-chevron"></use></svg>
          </summary>
          <div class="absolute left-0 top-full z-30 mt-2 min-w-40 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-2xl">
            <a href="/text" data-nav-path="/text" class="block rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">Text</a>
            <a id="nav-files-link" href="/files" data-nav-path="/files" class="block rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">Files</a>
          </div>
        </details>
        <a href="/nearby" data-nav-path="/nearby" class="desktop-nav-item rounded-lg px-3 py-2 text-slate-400 transition hover:text-white">Nearby</a>
        <a href="/receive" data-nav-path="/receive" class="desktop-nav-item rounded-lg px-3 py-2 text-slate-400 transition hover:text-white">Receive</a>
        <details class="nav-dropdown desktop-nav-item relative">
          <summary class="flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-2 text-slate-400 transition hover:text-white [&::-webkit-details-marker]:hidden">
            Tools
            <svg viewBox="0 0 24 24" class="h-3 w-3 opacity-70"><use href="#i-chevron"></use></svg>
          </summary>
          <div class="absolute left-0 top-full z-30 mt-2 min-w-44 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-2xl">
            <a id="nav-qr-link" href="/qr" data-nav-path="/qr" class="block rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">QR generator</a>
          </div>
        </details>
        <details class="nav-dropdown desktop-nav-item relative">
          <summary class="flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-2 text-slate-400 transition hover:text-white [&::-webkit-details-marker]:hidden">
            Help
            <svg viewBox="0 0 24 24" class="h-3 w-3 opacity-70"><use href="#i-chevron"></use></svg>
          </summary>
          <div class="absolute left-0 top-full z-30 mt-2 min-w-40 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-2xl">
            <a href="/guide" data-nav-path="/guide" class="block rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">Guide</a>
            <a href="/faq" data-nav-path="/faq" class="block rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">FAQ</a>
            <a href="/about" data-nav-path="/about" class="block rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">About</a>
          </div>
        </details>
        <button type="button" data-action="toggle-theme" class="icon-button" aria-label="Toggle light or dark mode">
          <svg data-theme-icon viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-theme"></use></svg>
        </button>
        __NAV_AUTH_SLOT__
        <button type="button" data-action="open-drawer" class="min-[901px]:hidden icon-button" aria-label="Open menu">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-menu"></use></svg>
        </button><button type="button" class="icon-button min-[901px]:hidden" data-action="open-scanner" aria-label="Scan a share QR code"><svg viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-qr-grid"></use></svg></button>
      </nav>
    </div>
  </header>`;

const MOBILE_BOTTOM_BAR = String.raw`<nav class="hidden max-[900px]:flex fixed inset-x-0 bottom-0 z-30 items-stretch justify-around border-t border-[var(--line)] bg-[var(--panel)] px-2 py-1.5" aria-label="Mobile navigation">
    <a href="/text" data-nav-path="/text" class="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition hover:text-white">
      <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-upload"></use></svg>
      Send
    </a>
    <a href="/nearby" data-nav-path="/nearby" class="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition hover:text-white">
      <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-wifi"></use></svg>
      Nearby
    </a>
    <a href="/receive" data-nav-path="/receive" class="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition hover:text-white">
      <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-arrow-down"></use></svg>
      Receive
    </a>
    <button type="button" data-action="open-drawer" class="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition hover:text-white">
      <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-menu"></use></svg>
      Menu
    </button>
  </nav>`;

const SITE_FOOTER = String.raw`<footer id="site-footer" class="site-footer">
    <div class="mx-auto max-w-6xl px-5 py-10 sm:px-7">
      <div class="footer-grid">
        <div>
          <a href="/" class="inline-flex items-center gap-3">
            <span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-logo"></use></svg></span>
            <strong class="site-wordmark text-lg">__APP_NAME__</strong>
          </a>
          <p id="footer-tagline" class="mt-4 max-w-sm text-sm leading-6 text-slate-500">Temporary text sharing, made simple.</p>
        </div>
        <div>
          <p id="footer-explore-title" class="footer-heading">Explore</p>
          <div class="footer-links">
            <a id="footer-create-text" href="/text" class="transition hover:text-[var(--accent)]">Send text</a>
            <a href="/files" class="transition hover:text-[var(--accent)]">Send files</a>
            <a id="footer-available-text" href="/nearby" class="transition hover:text-[var(--accent)]">Nearby</a>
            <a id="footer-open-code-text" href="/receive" class="transition hover:text-[var(--accent)]">Receive</a>
          </div>
        </div>
        <div>
          <p id="footer-information-title" class="footer-heading">Information</p>
          <div class="footer-links">
            <a id="footer-guide-text" href="/guide" class="transition hover:text-[var(--accent)]">How to use</a>
            <a href="/faq" class="transition hover:text-[var(--accent)]">FAQ</a>
            <a id="footer-about-text" href="/about" class="transition hover:text-[var(--accent)]">About</a>
            <button id="footer-feedback-text" type="button" data-action="open-drawer-section" data-drawer-target="feedback-drawer-section">Feedback</button>
            <a href="/privacy" class="transition hover:text-[var(--accent)]">Privacy</a>
            <a href="/terms" class="transition hover:text-[var(--accent)]">Terms</a>
          </div>
        </div>
        <div id="footer-social-column">
          <p id="footer-connect-title" class="footer-heading">Connect</p>
          <div id="footer-social-links" class="social-links"></div>
        </div>
      </div>
      <div class="footer-bottom">
        <p id="footer-copyright">© <span id="footer-year"></span> __APP_NAME__. All rights reserved.</p>
        <p id="footer-developer-line">Designed and developed by <strong id="footer-developer-name">Farhan Ali</strong></p>
      </div>
    </div>
  </footer>`;

const SIDE_DRAWER = String.raw`<div id="drawer-backdrop" class="drawer-backdrop" data-action="close-drawer"></div>
  <aside id="side-drawer" class="side-drawer" aria-hidden="true" aria-label="AirText menu">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-logo"></use></svg></span>
        <strong>__APP_NAME__</strong>
      </div>
      <button type="button" data-action="close-drawer" class="icon-button" aria-label="Close menu"><svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg></button>
    </div>

    <nav class="mt-7 grid gap-2" aria-label="Menu">
      <a href="/text" class="primary-action px-4 py-3 text-left font-semibold">Send text →</a>
      <a href="/files" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Send files</a>
      <a href="/nearby" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Nearby</a>
      <a href="/receive" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Receive a code</a>
      <button id="drawer-scan-text" type="button" data-action="open-scanner" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Scan a QR code</button>
      <a href="/qr" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">QR generator</a>
      <a href="/guide" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Guide</a>
      <a href="/faq" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">FAQ</a>
      <a href="/about" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">About</a>
    </nav>

    <section id="feedback-drawer-section" class="drawer-section">
      <p id="feedback-eyebrow" class="hero-kicker">Feedback</p>
      <h2 id="feedback-title" class="mt-2 text-2xl font-bold text-white">Help improve AirText</h2>
      <p id="feedback-intro" class="mt-2 text-sm leading-6 text-slate-500">Share a suggestion, report a problem or tell us what feels unclear.</p>
      <form id="feedback-form" class="mt-5 grid gap-3" novalidate>
        <select id="feedback-category" class="form-field">
          <option value="suggestion">Suggestion</option>
          <option value="bug">Bug report</option>
          <option value="design">Design feedback</option>
          <option value="other">Other</option>
        </select>
        <textarea id="feedback-message" class="form-field min-h-28 resize-y" maxlength="2000" placeholder="Tell us what you think…"></textarea>
        <input id="feedback-email" class="form-field" type="email" maxlength="200" placeholder="Email (optional)">
        <select id="feedback-rating" class="form-field">
          <option value="0">Rating (optional)</option>
          <option value="5">5 — Excellent</option>
          <option value="4">4 — Good</option>
          <option value="3">3 — Average</option>
          <option value="2">2 — Needs work</option>
          <option value="1">1 — Poor</option>
        </select>
        <button id="feedback-submit" type="submit" class="primary-action px-4 py-3 font-semibold">Submit feedback</button>
      </form>
    </section>

    <section class="drawer-section text-sm leading-6 text-slate-500">
      <p><strong class="text-white">Privacy:</strong> <span id="privacy-text">Notes and configuration use D1. Network addresses are hashed before use; raw IP addresses are not stored in analytics.</span></p>
      <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <a href="/privacy" class="text-[var(--accent)]">Privacy policy</a>
        <a href="/terms" class="text-[var(--accent)]">Terms of service</a>
      </div>
      <div id="drawer-auth-slot" class="mt-5">
        <a href="/login" class="inline-block text-[var(--accent)]">Sign in →</a>
      </div>
    </section>
  </aside>`;

const SHARED_MODALS = String.raw`<div id="maintenance-modal" class="maintenance-modal hidden-force" role="dialog" aria-modal="true" aria-labelledby="maintenance-title">
    <div class="maintenance-card">
      <span class="maintenance-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="h-7 w-7"><use href="#i-warning"></use></svg>
      </span>
      <p id="maintenance-eyebrow" class="hero-kicker">Scheduled maintenance</p>
      <h2 id="maintenance-title">AirText is under maintenance</h2>
      <p id="maintenance-message">We are making a few improvements. New notes are temporarily paused; please check again shortly.</p>
      <button id="maintenance-button" type="button" data-action="refresh-page" class="primary-action w-full px-5 py-3 font-semibold">Refresh page</button>
    </div>
  </div>

  <!-- View modal -->
  <div id="item-modal" class="fixed inset-0 z-50 hidden items-end justify-center bg-[#02040a]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div data-modal-panel class="glass-panel slide-up max-h-[92vh] w-full max-w-2xl overflow-hidden shadow-2xl sm:rounded-2xl">
      <div class="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4 sm:px-6">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span id="modal-lock-badge" class="note-badge"></span>
            <span id="modal-expiry" data-expires="0" class="note-badge">Expires soon</span>
          </div>
          <h2 id="modal-title" class="mt-3 truncate text-xl font-semibold text-white">Shared text</h2>
        </div>
        <button type="button" data-action="close-item-modal" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg>
        </button>
      </div>

      <div class="scrollbar-thin max-h-[calc(92vh-80px)] overflow-y-auto p-5 sm:p-6">
        <div id="modal-loading" class="py-14 text-center">
          <span class="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]"></span>
          <p class="mt-3 text-sm text-neutral-500">Opening…</p>
        </div>

        <div id="modal-error" class="hidden border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"></div>

        <form id="unlock-form" class="hidden" novalidate>
          <div class="rounded-xl border border-white/[.07] bg-black/20 p-5">
            <h3 class="font-medium text-white">PIN required</h3>
            <p class="mt-1 text-sm text-neutral-500">Enter the PIN provided by the sender.</p>
            <label for="unlock-pin" class="sr-only">Secret PIN</label>
            <input id="unlock-pin" type="password" maxlength="__MAX_PIN_LENGTH__" autocomplete="current-password" placeholder="Secret PIN" class="mt-5 w-full rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-400/50">
            <button id="unlock-submit" type="submit" class="mt-3 w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:opacity-50">
              Unlock
            </button>
          </div>
        </form>

        <div id="modal-content" class="hidden">
          <div id="modal-shared-by" class="modal-shared-by-row mb-3 hidden"></div>
          <div class="modal-text-shell overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
            <div class="modal-text-toolbar">
              <span class="modal-text-label">Text</span>
              <div class="modal-text-toolbar-actions">
                <div id="modal-text-tools-slot"></div>
                <button type="button" data-action="copy-text" class="action-btn primary-action">Copy text</button>
              </div>
            </div>
            <pre id="modal-text" class="linkified-text scrollbar-thin max-h-[48vh] min-h-[110px] overflow-auto whitespace-pre-wrap break-words p-5 font-sans text-sm leading-7 text-slate-200"></pre>
          </div>

          <div class="modal-footer-actions mt-4 flex flex-col gap-2.5 sm:flex-row">
            <button type="button" data-action="show-current-qr" class="action-btn flex-1 py-2.5 text-sm font-semibold">
              Code & QR
            </button>
            <button id="edit-item-button" type="button" data-action="open-edit-item-modal" class="action-btn hidden flex-1 items-center justify-center py-2.5 text-sm font-semibold" hidden>
              Edit
            </button>
            <button id="delete-item-button" type="button" data-action="delete-current-item" class="action-btn modal-delete-btn hidden flex-1 items-center justify-center py-2.5 text-sm font-semibold" hidden>
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="file-modal" class="fixed inset-0 z-50 hidden items-end justify-center bg-[#02040a]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div data-modal-panel class="glass-panel slide-up max-h-[92vh] w-full max-w-lg overflow-hidden shadow-2xl sm:rounded-2xl">
      <div class="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4 sm:px-6">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span id="file-modal-lock-badge" class="note-badge"></span>
            <span id="file-modal-expiry" class="note-badge">Expires soon</span>
          </div>
          <h2 id="file-modal-title" class="mt-3 truncate text-xl font-semibold text-white">Shared file</h2>
        </div>
        <button type="button" data-action="close-file-modal" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg>
        </button>
      </div>

      <div class="scrollbar-thin max-h-[calc(92vh-80px)] overflow-y-auto p-5 sm:p-6">
        <div id="file-modal-loading" class="py-14 text-center">
          <span class="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]"></span>
          <p class="mt-3 text-sm text-neutral-500">Opening…</p>
        </div>

        <div id="file-modal-error" class="hidden border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"></div>

        <form id="file-unlock-form" class="hidden" novalidate>
          <div class="rounded-xl border border-white/[.07] bg-black/20 p-5">
            <h3 class="font-medium text-white">PIN required</h3>
            <p class="mt-1 text-sm text-neutral-500">Enter the PIN provided by the sender.</p>
            <label for="file-unlock-pin" class="sr-only">Secret PIN</label>
            <input id="file-unlock-pin" type="password" maxlength="__MAX_PIN_LENGTH__" autocomplete="current-password" placeholder="Secret PIN" class="mt-5 w-full rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-400/50">
            <button id="file-unlock-submit" type="submit" class="mt-3 w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:opacity-50">
              Unlock
            </button>
          </div>
        </form>

        <div id="file-modal-content" class="hidden">
          <div id="file-modal-shared-by" class="modal-shared-by-row mb-3 hidden"></div>
          <div id="file-modal-list" class="grid gap-2.5"></div>
          <div class="modal-footer-actions mt-4 flex flex-col gap-2.5 sm:flex-row">
            <button type="button" data-action="show-current-file-qr" class="action-btn flex-1 py-2.5 text-sm font-semibold">Code & QR</button>
            <button id="edit-file-button" type="button" data-action="open-edit-file-modal" class="action-btn hidden flex-1 items-center justify-center py-2.5 text-sm font-semibold" hidden>Edit</button>
            <button id="delete-file-button" type="button" data-action="delete-current-file" class="action-btn modal-delete-btn hidden flex-1 items-center justify-center py-2.5 text-sm font-semibold" hidden>Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit note modal -->
  <div id="edit-item-modal" class="fixed inset-0 z-50 hidden items-end justify-center bg-[#02040a]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div class="glass-panel slide-up max-h-[92vh] w-full max-w-2xl overflow-hidden shadow-2xl sm:rounded-2xl">
      <div class="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4 sm:px-6">
        <h2 class="text-xl font-semibold text-white">Edit share</h2>
        <button type="button" data-action="close-edit-item-modal" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg>
        </button>
      </div>
      <form id="edit-item-form" class="scrollbar-thin max-h-[calc(92vh-80px)] overflow-y-auto p-5 sm:p-6" novalidate>
        <div id="edit-item-error" class="hidden mb-4 border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"></div>
        <label for="edit-item-title" class="sr-only">Title</label>
        <input id="edit-item-title" type="text" maxlength="__MAX_TITLE_LENGTH__" placeholder="Title" class="w-full rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
        <label for="edit-item-text" class="sr-only">Text</label>
        <div class="composer-code-toolbar mt-3">
          <span class="composer-code-label">Content</span>
          <div class="composer-code-actions">
            <button type="button" data-action="paste-edit-code" class="action-btn">Paste code</button>
            <button type="button" data-action="format-edit-code" class="action-btn">Format code</button>
            <button id="edit-code-mode-toggle" type="button" data-action="toggle-edit-code-mode" aria-pressed="false" class="action-btn">&lt;/&gt; Code mode</button>
          </div>
        </div>
        <textarea id="edit-item-text" rows="8" maxlength="__MAX_TEXT_LENGTH__" placeholder="Leave blank to keep the current text" class="scrollbar-thin mt-2 w-full resize-y rounded-lg border border-[var(--line)] bg-black/25 p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"></textarea>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input id="edit-item-lock-toggle" type="checkbox" class="peer sr-only">
            <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
            <span>Lock with PIN</span>
          </label>
          <div id="edit-item-pin-field-wrap" class="hidden">
            <label for="edit-item-pin" class="sr-only">New PIN</label>
            <input id="edit-item-pin" type="password" minlength="__MIN_PIN_LENGTH__" maxlength="__MAX_PIN_LENGTH__" autocomplete="new-password" placeholder="Leave blank to keep current PIN" class="w-56 rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
          </div>
          <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input id="edit-item-burn-toggle" type="checkbox" class="peer sr-only">
            <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
            <span>Open once</span>
          </label>
          <label for="edit-item-ttl-select" class="sr-only">Expiry</label>
          <select id="edit-item-ttl-select" class="w-auto rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/50">
            <option value="">Keep current expiry</option>
            <option value="600">10 minutes from now</option>
            <option value="3600">1 hour from now</option>
            <option value="86400">1 day from now</option>
            <option value="259200">3 days from now</option>
            <option value="604800">7 days from now</option>
            <option value="2592000">30 days from now</option>
          </select>
        </div>
        <div class="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="submit" id="edit-item-submit" class="primary-action flex-1 px-5 py-3 text-sm font-semibold">Save changes</button>
          <button type="button" data-action="close-edit-item-modal" class="flex-1 rounded-md border border-[var(--line)] px-5 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Edit file modal -->
  <div id="edit-file-modal" class="fixed inset-0 z-50 hidden items-end justify-center bg-[#02040a]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div class="glass-panel slide-up max-h-[92vh] w-full max-w-lg overflow-hidden shadow-2xl sm:rounded-2xl">
      <div class="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4 sm:px-6">
        <h2 class="text-xl font-semibold text-white">Edit files</h2>
        <button type="button" data-action="close-edit-file-modal" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg>
        </button>
      </div>
      <form id="edit-file-form" class="scrollbar-thin max-h-[calc(92vh-80px)] overflow-y-auto p-5 sm:p-6" novalidate>
        <div id="edit-file-error" class="hidden mb-4 border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"></div>
        <label for="edit-file-title" class="sr-only">Title</label>
        <input id="edit-file-title" type="text" maxlength="80" placeholder="Title" class="w-full rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
        <div id="edit-file-existing-list" class="mt-3 grid gap-1 text-xs text-slate-400"></div>
        <label id="edit-file-add-zone" for="edit-file-input" class="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 px-4 py-6 text-center text-xs text-slate-500 transition hover:border-cyan-400/40">
          <span>Add more files</span>
          <input id="edit-file-input" type="file" multiple class="sr-only">
        </label>
        <div id="edit-file-staged-list" class="mt-2 hidden grid gap-1 text-xs text-slate-400"></div>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input id="edit-file-lock-toggle" type="checkbox" class="peer sr-only">
            <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
            <span>Lock with PIN</span>
          </label>
          <div id="edit-file-pin-field-wrap" class="hidden">
            <label for="edit-file-pin" class="sr-only">New PIN</label>
            <input id="edit-file-pin" type="password" minlength="__MIN_PIN_LENGTH__" maxlength="__MAX_PIN_LENGTH__" autocomplete="new-password" placeholder="Leave blank to keep current PIN" class="w-56 rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
          </div>
          <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input id="edit-file-burn-toggle" type="checkbox" class="peer sr-only">
            <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
            <span>Open once</span>
          </label>
          <label for="edit-file-ttl-select" class="sr-only">Expiry</label>
          <select id="edit-file-ttl-select" class="w-auto rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/50">
            <option value="">Keep current expiry</option>
            <option value="600">10 minutes from now</option>
            <option value="3600">1 hour from now</option>
            <option value="86400">1 day from now</option>
            <option value="259200">3 days from now</option>
            <option value="604800">7 days from now</option>
            <option value="2592000">30 days from now</option>
          </select>
        </div>
        <div class="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="submit" id="edit-file-submit" class="primary-action flex-1 px-5 py-3 text-sm font-semibold">Save changes</button>
          <button type="button" data-action="close-edit-file-modal" class="flex-1 rounded-md border border-[var(--line)] px-5 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <!-- QR modal -->
  <div id="qr-modal" class="fixed inset-0 z-[60] hidden items-end justify-center bg-[#02040a]/85 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div class="glass-panel slide-up w-full max-w-sm p-5 shadow-2xl sm:rounded-2xl">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-white">Share code</h2>
        <button type="button" data-action="close-qr-modal" class="grid h-9 w-9 place-items-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg>
        </button>
      </div>

      <div class="mt-5 rounded-xl bg-white p-4">
        <div id="qr-output" class="grid place-items-center"></div>
      </div>

      <div class="mt-4 border border-white/5 bg-[#1d1d1d] px-4 py-3 text-center">
        <p id="qr-code-text" class="font-mono text-2xl font-semibold tracking-[.25em] text-white">------</p>
      </div>

      <div class="mt-3 flex items-center gap-2 border border-white/5 bg-[#1d1d1d] p-2 pl-3">
        <input id="qr-link-input" readonly class="min-w-0 flex-1 bg-transparent text-xs text-neutral-500 outline-none">
        <button type="button" data-action="copy-link" class="rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-strong)]">Copy link</button>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <button type="button" data-action="copy-code" class="w-full rounded-md border border-[var(--line)] px-4 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Copy code</button>
        <button id="web-share-button" type="button" data-action="web-share" class="hidden w-full rounded-md border border-[var(--line)] px-4 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Share…</button>
      </div>
    </div>
  </div>

  <!-- Scanner modal -->
  <div id="scanner-modal" class="fixed inset-0 z-[70] hidden items-end justify-center bg-[#02040a]/85 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div class="glass-panel slide-up w-full max-w-lg p-5 shadow-2xl sm:rounded-2xl">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-white">Scan QR</h2>
        <button type="button" data-action="close-scanner" class="grid h-9 w-9 place-items-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-white" aria-label="Close scanner">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg>
        </button>
      </div>
      <div id="qr-reader" class="mt-5 min-h-64 bg-[#1b1b1b]"></div>
      <p id="scanner-status" class="mt-4 text-center text-sm text-neutral-500">Starting camera…</p>
    </div>
  </div>

  <div id="toast-container" class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"></div>`;

function pageAccountContent(): string {
  return String.raw`<div id="account-app">
      <div class="mx-auto mt-4 grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section id="account-benefits-card" class="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 lg:p-8">
          <p class="hero-kicker">Why sign in?</p>
          <h1 class="mt-3 text-3xl font-bold text-white">More room, more control</h1>
          <p class="mt-2 text-sm leading-6 text-slate-500">Anyone can share without an account. Signing in unlocks a bigger plan and a place to manage what you've sent.</p>
          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <div class="flex items-start gap-3"><span class="tier-badge tier-badge-pro shrink-0"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5"><use href="#i-qr-grid"></use></svg></span><div><strong class="text-sm font-semibold text-white">Choose your own link</strong><p class="mt-1 text-xs leading-5 text-slate-500">Pick a memorable code instead of a random one.</p></div></div>
            <div class="flex items-start gap-3"><span class="tier-badge tier-badge-pro shrink-0"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5"><use href="#i-upload"></use></svg></span><div><strong class="text-sm font-semibold text-white">Longer, bigger drops</strong><p class="mt-1 text-xs leading-5 text-slate-500">Higher size caps and drops that stick around longer.</p></div></div>
            <div class="flex items-start gap-3"><span class="tier-badge tier-badge-pro shrink-0"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5"><use href="#i-refresh"></use></svg></span><div><strong class="text-sm font-semibold text-white">My Drops dashboard</strong><p class="mt-1 text-xs leading-5 text-slate-500">See and manage everything you've shared in one place.</p></div></div>
            <div class="flex items-start gap-3"><span class="tier-badge tier-badge-pro shrink-0"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5"><use href="#i-warning"></use></svg></span><div><strong class="text-sm font-semibold text-white">Extra encryption</strong><p class="mt-1 text-xs leading-5 text-slate-500">Optional browser encryption with a separate key in the share link.</p></div></div>
          </div>

          <div class="mt-8 border-t border-[var(--line)] pt-6">
            <h2 class="text-sm font-bold text-white">Why is signup invite-only?</h2>
            <p class="mt-2 text-sm leading-6 text-slate-500">AirText's anonymous, no-account sharing already covers most people, so we keep paid-tier accounts invite-only rather than run open self-serve signup -- it keeps abuse low and lets us give every account a real, reviewed limit. Tell us what you need it for below and we'll set one up.</p>
            <form id="account-request-form" class="mt-4 grid gap-3">
              <input id="account-request-name" class="form-field" type="text" maxlength="80" placeholder="Name" required>
              <input id="account-request-email" class="form-field" type="email" maxlength="200" placeholder="Email" required>
              <textarea id="account-request-reason" class="form-field" maxlength="500" rows="3" placeholder="Why do you need an account?" required></textarea>
              <button id="account-request-submit" type="submit" class="rounded-md border border-[var(--line)] px-4 py-3 text-sm font-semibold">Request an account</button>
              <p id="account-request-status" class="hidden text-sm"></p>
            </form>
          </div>
        </section>

        <section id="account-signin-card" class="h-fit rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
          <p class="hero-kicker">Account</p>
          <h2 class="mt-3 text-2xl font-bold text-white">Sign in</h2>
          <p id="account-signin-help" class="mt-2 text-sm leading-6 text-slate-500">Sign in with your Pro or Member account.</p>
          <form id="account-login-form" class="mt-6 grid gap-3">
            <input id="account-email" class="form-field" type="email" autocomplete="username" placeholder="Email">
            <input id="account-password" class="form-field" type="password" autocomplete="current-password" placeholder="Password">
            <button id="account-login-submit" type="submit" class="primary-action px-4 py-3 font-semibold">Sign in</button>
            <p id="account-login-error" class="hidden text-sm text-red-400"></p>
          </form>
        </section>
      </div>

      <section id="account-dashboard" class="hidden mx-auto mt-8 max-w-3xl grid gap-6">
        <div class="admin-panel">
          <div class="admin-panel-head">
            <div class="flex min-w-0 items-center gap-4">
              <span id="account-avatar" class="tier-avatar"></span>
              <div class="min-w-0">
                <p id="account-display-name" class="truncate text-lg font-bold text-white"></p>
                <p id="account-email-display" class="truncate text-sm text-slate-500"></p>
              </div>
            </div>
            <span id="account-role-badge" class="tier-badge"></span>
          </div>
        </div>

        <div class="admin-panel">
          <div class="admin-panel-head"><h2 class="font-bold text-white">Your plan limits</h2></div>
          <div id="account-limits-grid" class="admin-panel-body grid gap-2 text-sm text-slate-400"></div>
        </div>

        <div class="admin-panel">
          <div class="admin-panel-head"><h2 class="font-bold text-white">My text drops</h2><a href="/text" class="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold">+ New text drop</a></div>
          <div id="account-notes-list" class="admin-panel-body grid gap-2"></div>
        </div>

        <div class="admin-panel">
          <div class="admin-panel-head"><h2 class="font-bold text-white">My file drops</h2><a href="/files" class="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold">+ New file drop</a></div>
          <div id="account-files-list" class="admin-panel-body grid gap-2"></div>
        </div>

        <div class="admin-panel">
          <div class="admin-panel-head"><h2 class="font-bold text-white">Change password</h2></div>
          <form id="account-password-form" class="admin-panel-body grid gap-3 max-w-sm">
            <input id="account-current-password" class="form-field" type="password" autocomplete="current-password" placeholder="Current password">
            <input id="account-new-password" class="form-field" type="password" autocomplete="new-password" placeholder="New password">
            <input id="account-confirm-password" class="form-field" type="password" autocomplete="new-password" placeholder="Confirm new password">
            <button id="account-password-submit" type="submit" class="rounded-md border border-[var(--line)] px-4 py-3 text-sm font-semibold">Update password</button>
            <p id="account-password-status" class="hidden text-sm"></p>
          </form>
        </div>
      </section>
  </div>`;
}

const ADMIN_APP_SECTION = String.raw`<section id="admin-app" class="admin-screen hidden-force">
    <header id="admin-login-header" class="site-header sticky top-0 z-40 border-b">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-7">
        <a href="/" class="flex items-center gap-3"><span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-logo"></use></svg></span><span class="site-wordmark text-lg font-bold">AirText Admin</span></a>
        <div class="flex items-center gap-2">
          <button type="button" data-action="toggle-theme" class="icon-button" aria-label="Toggle theme"><svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-theme"></use></svg></button>
        </div>
      </div>
    </header>

    <div id="admin-login-wrap" class="admin-wrap">
      <section id="admin-login-card" class="mx-auto mt-12 max-w-md rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <p class="hero-kicker">Administrator</p>
        <h1 class="mt-3 text-3xl font-bold text-white">Manage AirText</h1>
        <p id="admin-login-help" class="mt-2 text-sm leading-6 text-slate-500">Sign in with your administrator account.</p>
        <form id="admin-login-form" class="mt-6 grid gap-3">
          <input id="admin-email" class="form-field" type="email" autocomplete="username" placeholder="Email">
          <input id="admin-password" class="form-field" type="password" autocomplete="current-password" placeholder="Password">
          <button id="admin-login-submit" type="submit" class="primary-action px-4 py-3 font-semibold">Sign in</button>
        </form>
      </section>
    </div>

    <div id="admin-dashboard" class="hidden admin-shell">
      <aside id="admin-sidebar" class="admin-sidebar">
        <a href="/admin" class="admin-sidebar-brand">
          <span class="site-logo grid h-9 w-9 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-logo"></use></svg></span>
          <span><strong>AirText</strong><small>Admin</small></span>
        </a>
        <nav class="admin-sidebar-nav" role="tablist">
          <button type="button" class="admin-nav-link active" data-admin-tab="overview" role="tab" aria-selected="true">Overview</button>
          <button type="button" class="admin-nav-link" data-admin-tab="drops" role="tab" aria-selected="false">Drops</button>
          <button type="button" class="admin-nav-link" data-admin-tab="users" role="tab" aria-selected="false">Users</button>
          <button type="button" class="admin-nav-link" data-admin-tab="inbox" role="tab" aria-selected="false">Inbox<span id="admin-inbox-badge" class="admin-nav-badge hidden">0</span></button>
          <button type="button" class="admin-nav-link" data-admin-tab="settings" role="tab" aria-selected="false">Settings</button>
        </nav>
        <div class="admin-sidebar-footer">
          <span id="admin-health-d1" class="admin-health-dot">D1</span>
          <span id="admin-health-r2" class="admin-health-dot">R2</span>
        </div>
      </aside>

      <div class="admin-main">
        <div class="admin-topbar">
          <input id="admin-search" type="search" class="form-field admin-search-input" placeholder="Search this page…">
          <div class="admin-topbar-actions">
            <a href="/" class="header-secondary-link text-sm">View site</a>
            <button type="button" data-action="toggle-theme" class="icon-button" aria-label="Toggle theme"><svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-theme"></use></svg></button>
            <span class="tier-avatar tier-ring-admin" aria-hidden="true">👑</span>
            <button id="admin-logout" type="button" class="rounded-md border border-[var(--line)] px-4 py-2 text-sm">Sign out</button>
          </div>
        </div>

        <div class="admin-wrap admin-content-wrap">
        <div class="admin-tab-panel" data-admin-panel="overview">
          <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div><p class="hero-kicker">Control center</p><h1 class="mt-2 text-4xl font-bold text-white">Overview</h1></div>
            <button id="admin-refresh" type="button" class="rounded-md border border-[var(--line)] px-4 py-2 text-sm">Refresh</button>
          </div>
          <div id="admin-kpis" class="admin-stats"></div>
          <div class="admin-grid mt-5">
            <section class="admin-panel">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">Recent activity</h2><p class="text-xs text-slate-500">Last 20 admin actions</p></div></div>
              <div id="admin-activity-feed" class="admin-panel-body grid gap-3 text-sm"></div>
            </section>
            <div class="grid gap-5">
              <section class="admin-panel">
                <div class="admin-panel-head"><div><h2 class="font-bold text-white">Needs attention</h2></div></div>
                <div id="admin-attention" class="admin-panel-body grid gap-3 text-sm"></div>
              </section>
              <section class="admin-panel">
                <div class="admin-panel-head"><div><h2 class="font-bold text-white">7-day trend</h2></div></div>
                <div id="admin-trend-chart" class="admin-panel-body grid gap-4"></div>
              </section>
            </div>
          </div>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="drops">
          <div class="mb-6"><p class="hero-kicker">Content</p><h1 class="mt-2 text-4xl font-bold text-white">Drops</h1><p class="mt-2 text-xs text-slate-500">Metadata only — drop contents are never visible to admins.</p></div>

          <section class="admin-panel">
            <div class="admin-panel-head"><div><h2 class="font-bold text-white">Storage usage</h2><p class="text-xs text-slate-500">Site-wide R2 storage against the configured cap.</p></div></div>
            <div class="admin-panel-body">
              <div id="admin-storage-bar" class="storage-bar"><div id="admin-storage-fill" class="storage-bar-fill"></div></div>
              <p id="admin-storage-label" class="mt-2 text-xs text-slate-500">—</p>
              <p id="admin-storage-warning" class="mt-2 text-xs text-amber-400 hidden"></p>
            </div>
          </section>

          <section class="admin-panel mt-5">
            <div class="admin-panel-head admin-toolbar">
              <input id="admin-drops-search" class="form-field admin-toolbar-search" type="search" placeholder="Search by title or code…">
              <select id="admin-drops-type-filter" class="filter-select"><option value="">All types</option><option value="note">Notes</option><option value="file">Files</option></select>
              <select id="admin-drops-status-filter" class="filter-select"><option value="">All statuses</option><option value="locked">Locked</option><option value="burn">Open once</option><option value="expiring">Expiring soon</option></select>
              <select id="admin-drops-sort" class="filter-select"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="expiring">Expiring soonest</option></select>
              <label class="inline-flex items-center gap-2 text-xs text-slate-400"><input id="admin-drops-select-all" type="checkbox"> Select all</label>
              <button id="admin-drops-bulk-delete" type="button" class="hidden rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300">Delete selected</button>
            </div>
            <div class="admin-panel-body">
              <div id="admin-drops-list" class="grid gap-1"></div>
              <div id="admin-drops-pagination" class="admin-pagination"></div>
            </div>
          </section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="users">
          <div class="mb-6"><p class="hero-kicker">Accounts</p><h1 class="mt-2 text-4xl font-bold text-white">Users</h1><p class="mt-2 text-xs text-slate-500">Only admins can create accounts -- no public signup.</p></div>

          <section class="admin-panel">
            <div class="admin-panel-head admin-toolbar">
              <input id="admin-users-search" class="form-field admin-toolbar-search" type="search" placeholder="Search by name or email…">
              <select id="admin-users-role-filter" class="filter-select"><option value="">All roles</option></select>
              <select id="admin-users-status-filter" class="filter-select"><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
            </div>
            <div class="admin-panel-body">
              <div id="admin-users-list" class="grid gap-1"></div>
              <div id="admin-users-pagination" class="admin-pagination"></div>
            </div>
          </section>

          <section id="admin-user-create-section" class="admin-panel mt-5">
            <div class="admin-panel-head"><div><h2 class="font-bold text-white">Create account</h2></div></div>
            <form id="admin-user-create-form" class="admin-panel-body grid gap-3 sm:grid-cols-2">
              <label class="grid gap-2 text-sm">Email<input id="new-user-email" class="form-field" type="email" required></label>
              <label class="grid gap-2 text-sm">Display name<input id="new-user-name" class="form-field" type="text" maxlength="80" required></label>
              <label class="grid gap-2 text-sm">Password<input id="new-user-password" class="form-field" type="password" minlength="10" required></label>
              <label class="grid gap-2 text-sm">Role<select id="new-user-role" class="form-field"></select></label>
              <button id="admin-user-create-submit" type="submit" class="primary-action px-4 py-3 font-semibold sm:col-span-2">Create account</button>
            </form>
          </section>

          <section class="admin-panel mt-5">
            <div class="admin-panel-head"><div><h2 class="font-bold text-white">Roles &amp; default limits</h2><p class="text-xs text-slate-500">Rename a role or edit what Pro/Member accounts get by default. Admin limits are fixed.</p></div></div>
            <div id="admin-roles" class="admin-panel-body grid gap-4"></div>
          </section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="inbox">
          <div class="mb-6"><p class="hero-kicker">Messages</p><h1 class="mt-2 text-4xl font-bold text-white">Inbox</h1></div>

          <div class="admin-tabs" role="tablist">
            <button type="button" class="admin-tab active" data-inbox-tab="feedback" role="tab" aria-selected="true">Feedback</button>
            <button type="button" class="admin-tab" data-inbox-tab="requests" role="tab" aria-selected="false">Account requests</button>
          </div>

          <section class="admin-panel">
            <div class="admin-panel-head admin-toolbar">
              <div id="admin-inbox-counts" class="flex flex-wrap gap-2 text-xs text-slate-500"></div>
              <select id="admin-inbox-status-filter" class="filter-select"><option value="">All statuses</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select>
            </div>
            <div class="admin-panel-body">
              <div id="admin-inbox-list" class="grid gap-1"></div>
              <div id="admin-inbox-pagination" class="admin-pagination"></div>
            </div>
          </section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="settings">
          <div class="mb-6"><p class="hero-kicker">Configuration</p><h1 class="mt-2 text-4xl font-bold text-white">Settings</h1><p class="mt-2 text-xs text-slate-500">Changes apply without redeploying.</p></div>

          <div class="admin-tabs" role="tablist">
            <button type="button" class="admin-tab active" data-settings-subtab="general" role="tab" aria-selected="true">General</button>
            <button type="button" class="admin-tab" data-settings-subtab="limits" role="tab" aria-selected="false">Limits &amp; Features</button>
            <button type="button" class="admin-tab" data-settings-subtab="content" role="tab" aria-selected="false">Content</button>
            <button type="button" class="admin-tab" data-settings-subtab="seo" role="tab" aria-selected="false">SEO</button>
            <button type="button" class="admin-tab" data-settings-subtab="danger" role="tab" aria-selected="false">Danger Zone</button>
          </div>

          <form id="admin-settings-form">
            <section class="admin-panel" data-settings-panel="general">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">General</h2><p class="text-xs text-slate-500">Site identity and the announcement strip.</p></div></div>
              <div class="admin-panel-body">
                <div class="settings-grid">
                  <label class="grid gap-2 text-sm">Site name<input id="setting-app-name" class="form-field" maxlength="40"></label>
                  <label class="grid gap-2 text-sm">Tagline<input id="setting-tagline" class="form-field" maxlength="100"></label>
                  <label class="grid gap-2 text-sm">Default theme<select id="setting-default-theme" class="form-field"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
                  <label class="grid gap-2 text-sm sm:col-span-2">Announcement message<input id="setting-announcement" class="form-field" maxlength="1000"></label>
                </div>
                <div id="admin-content-fields-general" class="mt-5 grid gap-5"></div>
                <div class="mt-5"><label class="setting-toggle"><span>Announcement line</span><input id="setting-announcement-enabled" type="checkbox"></label></div>
              </div>
            </section>

            <section class="admin-panel hidden" data-settings-panel="limits">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">Limits &amp; Features</h2><p class="text-xs text-slate-500">Numeric bounds are clamped server-side into safe ranges.</p></div></div>
              <div class="admin-panel-body">
                <div class="settings-grid">
                  <label class="grid gap-2 text-sm">Expiry in minutes<input id="setting-ttl" class="form-field" type="number" min="5" max="1440"></label>
                  <label class="grid gap-2 text-sm">Notes per network<input id="setting-max-items" class="form-field" type="number" min="10" max="100"></label>
                  <label class="grid gap-2 text-sm">Title length<input id="setting-title-length" class="form-field" type="number" min="20" max="120"></label>
                  <label class="grid gap-2 text-sm">Text length<input id="setting-text-length" class="form-field" type="number" min="500" max="20000"></label>
                  <label class="grid gap-2 text-sm">Create cooldown (seconds)<input id="setting-create-cooldown" class="form-field" type="number" min="1" max="60"></label>
                  <label class="grid gap-2 text-sm">Unlock cooldown (seconds)<input id="setting-unlock-cooldown" class="form-field" type="number" min="1" max="30"></label>
                </div>
                <div class="mt-5 grid gap-x-8 md:grid-cols-2">
                  <label class="setting-toggle"><span>Allow new notes</span><input id="setting-notes-enabled" type="checkbox"></label>
                  <label class="setting-toggle"><span>PIN protection</span><input id="setting-pin-enabled" type="checkbox"></label>
                  <label class="setting-toggle"><span>Cross-network auto-add</span><input id="setting-cross-network" type="checkbox"></label>
                  <label class="setting-toggle"><span>Feedback form</span><input id="setting-feedback-enabled" type="checkbox"></label>
                  <label class="setting-toggle"><span>Privacy-safe analytics</span><input id="setting-analytics-enabled" type="checkbox"></label>
                </div>
                <div id="admin-content-fields-limits" class="mt-5 grid gap-5"></div>
              </div>
            </section>

            <section class="admin-panel hidden" data-settings-panel="content">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">Content</h2><p class="text-xs text-slate-500">Public copy: hero, about, developer, footer, social and maintenance text.</p></div></div>
              <div class="admin-panel-body">
                <div id="admin-content-fields-content" class="grid gap-5"></div>
              </div>
            </section>

            <section class="admin-panel hidden" data-settings-panel="seo">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">SEO</h2></div></div>
              <div class="admin-panel-body">
                <div id="admin-content-fields-seo" class="grid gap-5"></div>
              </div>
            </section>

            <section class="admin-panel hidden" data-settings-panel="danger">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">Danger zone</h2></div></div>
              <div class="admin-panel-body">
                <div class="danger-zone">
                  <p class="text-xs font-bold uppercase tracking-wider text-red-300">Maintenance mode</p>
                  <label class="setting-toggle"><span>Maintenance mode (pauses new notes and files site-wide)</span><input id="setting-maintenance" type="checkbox"></label>
                </div>
              </div>
            </section>

            <button id="admin-settings-submit" type="submit" class="primary-action mt-5 px-5 py-3 font-semibold">Save settings</button>
          </form>
        </div>
        </div>
      </div>
    </div>
  </section>`;

/* ------------------------------------------------------------------ */
/* Page content -- one function per route. Each returns ONLY its own   */
/* page's markup (no tabs, no other sections) except pageHomeContent, */
/* which is the full hero+tabs+create+notes+join+files experience,    */
/* unchanged, used for "/", "/s/:code" and "/f/:code".                 */
/* ------------------------------------------------------------------ */

function pageHomeContent(): string {
  const faqTeaser = FAQ_ENTRIES.slice(0, 4)
    .map(
      (entry) => `<details class="faq-item rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <summary class="cursor-pointer list-none text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
            <span class="mr-2 inline-block"><svg viewBox="0 0 24 24" class="inline h-4 w-4 -translate-y-0.5 opacity-60"><use href="#i-chevron"></use></svg></span>${escapeHtml(entry.question)}
          </summary>
          <p class="mt-3 text-sm leading-6 text-slate-500">${escapeHtml(entry.answer)}</p>
        </details>`,
    )
    .join("\n        ");

  return String.raw`<div id="announcement-bar" class="announcement-bar" role="status">
      <span id="announcement-label" class="announcement-label">NEW</span>
      <strong id="announcement-text">Move a drop to another device with one secure link, short code or QR scan.</strong>
      <span class="announcement-arrow" aria-hidden="true">↗</span>
    </div>

    <section id="hero-section" class="hero-shell hero-grid">
      <div class="hero-content">
        <p id="hero-eyebrow" class="hero-kicker">Temporary text &amp; file sharing</p>
        <h1 class="hero-title"><span id="hero-title-primary">Share anything.</span><br><span id="hero-title-outline" class="outline-word">Instantly.</span></h1>
        <p id="hero-description" class="hero-copy">Create a drop, protect it with a PIN, and move it between devices using a code, link or QR. No account required.</p>
        <div class="hero-actions">
          <a id="hero-primary-button" href="/text" class="primary-action px-5 py-3 font-semibold">Share text →</a>
          <a id="hero-secondary-button" href="/files" class="hero-secondary-action">Share files</a>
        </div>
        <p class="mt-5 text-xs font-medium uppercase tracking-wider text-slate-500">No account · Auto-deletes · Free</p>
      </div>

      <aside id="quick-share-card" class="hero-flow-card" aria-label="Quick share">
        <div class="hero-flow-glow"></div>
        <div class="relative">
          <p class="hero-kicker">Try it now</p>
          <div class="mt-3 flex gap-2">
            <button type="button" data-action="quick-share-tab" data-quick-tab="text" class="main-tab active" aria-current="true">Text</button>
            <button type="button" data-action="quick-share-tab" data-quick-tab="files" class="main-tab">Files</button>
          </div>

          <div id="quick-share-panel-text" data-quick-tab-panel="text" class="mt-4">
            ${createCardFragment()}
          </div>
          <div id="quick-share-panel-files" data-quick-tab-panel="files" class="mt-4 hidden">
            <section id="files-card" class="glass-panel app-shadow overflow-hidden rounded-2xl">
              ${filesUploadFragmentInner()}
            </section>
          </div>

          <details class="mt-4 border-t border-[var(--line)] pt-4">
            <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">Have a code?</summary>
            <div class="mt-3">
              ${joinCardFragment()}
            </div>
          </details>
        </div>
      </aside>
    </section>

    <div id="maintenance-banner" class="hidden mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">Maintenance mode is active. Existing drops can still be opened, but new ones are disabled.</div>

    <section id="share-anything-section" class="mt-16">
      <h2 class="text-center text-3xl font-bold text-white sm:text-4xl">Share anything</h2>
      <p class="mx-auto mt-2 max-w-xl text-center text-sm leading-6 text-slate-500">One tool for whatever you need to move between devices.</p>
      <div class="mt-8 grid gap-4 sm:grid-cols-3">
        <a href="/text" class="glass-panel rounded-2xl p-6 transition hover:border-[var(--accent)]">
          <span class="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-logo"></use></svg></span>
          <h3 class="mt-4 text-lg font-semibold text-white">Text &amp; notes</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">Paste a note, lock it with a PIN, send it with a code, link or QR.</p>
        </a>
        <a href="/files" class="glass-panel rounded-2xl p-6 transition hover:border-[var(--accent)]">
          <span class="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-upload"></use></svg></span>
          <h3 class="mt-4 text-lg font-semibold text-white">Files &amp; photos</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">Send one or several files at once. Auto-deletes when the timer runs out.</p>
        </a>
        <a href="/qr" class="glass-panel rounded-2xl p-6 transition hover:border-[var(--accent)]">
          <span class="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-qr-grid"></use></svg></span>
          <h3 class="mt-4 text-lg font-semibold text-white">Links</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">Turn any link into a scannable QR code, right in the browser.</p>
        </a>
      </div>
    </section>

    <section id="how-it-works-section" class="mt-16">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-3xl font-bold text-white sm:text-4xl">How it works</h2>
          <p class="mt-2 text-sm leading-6 text-slate-500">Three steps, either way.</p>
        </div>
        <div class="flex gap-2">
          <button type="button" data-action="how-it-works-tab" data-how-tab="text" class="main-tab active" aria-current="true">Text</button>
          <button type="button" data-action="how-it-works-tab" data-how-tab="files" class="main-tab">Files</button>
        </div>
      </div>
      <div id="how-it-works-text" data-how-tab-panel="text" class="mt-6 grid gap-4 sm:grid-cols-3">
        <div class="glass-panel rounded-2xl p-5"><span class="step-number">1</span><h3 class="mt-3 font-semibold text-white">Create</h3><p class="mt-1 text-sm leading-6 text-slate-500">Type or paste your note, and optionally lock it with a PIN.</p></div>
        <div class="glass-panel rounded-2xl p-5"><span class="step-number">2</span><h3 class="mt-3 font-semibold text-white">Share code/link/QR</h3><p class="mt-1 text-sm leading-6 text-slate-500">Send the short code, the link, or let them scan a QR.</p></div>
        <div class="glass-panel rounded-2xl p-5"><span class="step-number">3</span><h3 class="mt-3 font-semibold text-white">Open anywhere</h3><p class="mt-1 text-sm leading-6 text-slate-500">They open it on any device -- it disappears automatically after.</p></div>
      </div>
      <div id="how-it-works-files" data-how-tab-panel="files" class="mt-6 hidden grid gap-4 sm:grid-cols-3">
        <div class="glass-panel rounded-2xl p-5"><span class="step-number">1</span><h3 class="mt-3 font-semibold text-white">Choose files</h3><p class="mt-1 text-sm leading-6 text-slate-500">Drag in one or several files, and optionally lock them with a PIN.</p></div>
        <div class="glass-panel rounded-2xl p-5"><span class="step-number">2</span><h3 class="mt-3 font-semibold text-white">Share code/link/QR</h3><p class="mt-1 text-sm leading-6 text-slate-500">Send the short code, the link, or let them scan a QR.</p></div>
        <div class="glass-panel rounded-2xl p-5"><span class="step-number">3</span><h3 class="mt-3 font-semibold text-white">Open anywhere</h3><p class="mt-1 text-sm leading-6 text-slate-500">They download the files on any device -- it disappears automatically after.</p></div>
      </div>
    </section>

    <section id="why-airtext-section" class="mt-16">
      <h2 class="text-center text-3xl font-bold text-white sm:text-4xl">Why AirText</h2>
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="glass-panel rounded-2xl p-5 text-center">
          <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-refresh"></use></svg></span>
          <h3 class="mt-3 font-semibold text-white">Auto-deletes</h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">Every drop disappears on its own -- nothing to clean up.</p>
        </div>
        <div class="glass-panel rounded-2xl p-5 text-center">
          <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-warning"></use></svg></span>
          <h3 class="mt-3 font-semibold text-white">PIN-locked</h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">Lock anything sensitive so only someone with the PIN can open it.</p>
        </div>
        <div class="glass-panel rounded-2xl p-5 text-center">
          <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-wifi"></use></svg></span>
          <h3 class="mt-3 font-semibold text-white">Any device</h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">Works between phones, laptops and tablets on any network.</p>
        </div>
        <div class="glass-panel rounded-2xl p-5 text-center">
          <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-eye"></use></svg></span>
          <h3 class="mt-3 font-semibold text-white">No signup</h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">Start sharing immediately -- an account is never required.</p>
        </div>
      </div>
    </section>

    <section id="wifi-live-strip" class="mt-16 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-4 text-sm text-slate-400">
      <span class="inline-flex h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true"></span>
      <span><strong id="wifi-live-count" class="text-white">0</strong> <span id="wifi-live-label">drops active on your Wi-Fi right now</span></span>
      <a href="/nearby" class="text-xs font-semibold text-[var(--accent)]">View nearby →</a>
    </section>

    <section id="device-grid-section" class="mt-16">
      <h2 class="text-center text-3xl font-bold text-white sm:text-4xl">Made for switching devices</h2>
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a href="/text" class="glass-panel flex items-center justify-between rounded-xl p-5"><span class="font-semibold text-white">Phone → Laptop</span><svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500"><use href="#i-arrow-right"></use></svg></a>
        <a href="/text" class="glass-panel flex items-center justify-between rounded-xl p-5"><span class="font-semibold text-white">iPhone → Windows</span><svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500"><use href="#i-arrow-right"></use></svg></a>
        <a href="/files" class="glass-panel flex items-center justify-between rounded-xl p-5"><span class="font-semibold text-white">Android → Mac</span><svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500"><use href="#i-arrow-right"></use></svg></a>
        <a href="/files" class="glass-panel flex items-center justify-between rounded-xl p-5"><span class="font-semibold text-white">Laptop → Phone</span><svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500"><use href="#i-arrow-right"></use></svg></a>
        <a href="/text" class="glass-panel flex items-center justify-between rounded-xl p-5"><span class="font-semibold text-white">Work → Home</span><svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500"><use href="#i-arrow-right"></use></svg></a>
        <a href="/files" class="glass-panel flex items-center justify-between rounded-xl p-5"><span class="font-semibold text-white">Any → Any</span><svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500"><use href="#i-arrow-right"></use></svg></a>
      </div>
    </section>

    <section id="faq-teaser-section" class="mt-16">
      <h2 class="text-center text-3xl font-bold text-white sm:text-4xl">Frequently asked questions</h2>
      <div class="mx-auto mt-8 grid max-w-3xl gap-3">
        ${faqTeaser}
      </div>
      <p class="mt-5 text-center text-sm"><a href="/faq" class="font-medium text-[var(--accent)]">See all FAQs →</a></p>
    </section>

    <section id="final-cta-section" class="mt-16 glass-panel app-shadow rounded-2xl p-8 text-center sm:p-12">
      <h2 class="text-3xl font-bold text-white sm:text-4xl">Ready to send something?</h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">No account, no setup -- create a drop and share it in seconds.</p>
      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a href="/text" class="primary-action px-6 py-3 font-semibold">Share text →</a>
        <a href="/files" class="hero-secondary-action">Share files</a>
      </div>
    </section>`;
}

/** The create-text card, shared verbatim between the home page's "Share"
 *  tab and the standalone /text page -- only the data-tab-panel attribute
 *  (meaningless outside the tabbed home page) differs. */
function createCardFragment(tabPanel?: string): string {
  const tabAttr = tabPanel ? ` data-tab-panel="${tabPanel}"` : "";
  return String.raw`<section id="create-card"${tabAttr} class="glass-panel app-shadow overflow-hidden rounded-2xl">
      <div class="flex items-center justify-between border-b border-white/[.07] px-5 py-5 sm:px-7">
        <div class="flex items-center gap-4">
          <span class="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-inset ring-[var(--line)]">
            <svg viewBox="0 0 24 24" class="h-7 w-7"><use href="#i-logo"></use></svg>
          </span>
          <div>
            <h1 id="create-section-title" class="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Share text</h1>
            <p id="create-expiry-copy" class="mt-1 text-xs text-slate-500">Visible on this network · deleted automatically</p>
          </div>
        </div>
        <span id="create-temporary-badge" class="hidden rounded-full border border-cyan-400/15 bg-cyan-400/[.06] px-3 py-1 text-xs text-cyan-200/80 sm:inline">Temporary</span>
      </div>

      <form id="create-form" novalidate>
        <div class="px-5 pt-6 sm:px-7">
          <div class="flex items-center gap-4 border-b border-[var(--line)] pb-4 focus-within:border-cyan-400/40">
            <label for="share-title" class="sr-only">Title</label>
            <input
              id="share-title"
              name="title"
              type="text"
              maxlength="__MAX_TITLE_LENGTH__"
              autocomplete="off"
              placeholder="Title"
              class="min-w-0 flex-1 bg-transparent text-lg font-medium text-white outline-none placeholder:text-slate-600"
            >
            <span id="title-counter" class="text-[11px] text-neutral-600">0 / __MAX_TITLE_LENGTH__</span>
          </div>

          <div class="composer-code-toolbar mt-3">
            <span class="composer-code-label">Text / Code</span>
            <div class="composer-code-actions">
              <button type="button" data-action="paste-share-code" class="action-btn">Paste code</button>
              <button type="button" data-action="format-share-code" class="action-btn">Format code</button>
              <button id="share-code-mode-toggle" type="button" data-action="toggle-share-code-mode" aria-pressed="false" class="action-btn">&lt;/&gt; Code mode</button>
            </div>
          </div>

          <div class="relative">
            <label for="share-text" class="sr-only">Text</label>
            <textarea
              id="share-text"
              name="text"
              rows="12"
              maxlength="__MAX_TEXT_LENGTH__"
              placeholder="Type or paste something..."
              class="scrollbar-thin min-h-[240px] w-full resize-y bg-transparent py-6 text-[15px] leading-7 text-slate-200 outline-none placeholder:text-slate-600 sm:min-h-[290px]"
            ></textarea>
            <span id="text-counter" class="absolute bottom-4 right-0 text-[11px] text-neutral-600">0 / __MAX_TEXT_LENGTH__</span>
          </div>
        </div>

        <div class="border-t border-white/[.06] bg-black/10 px-5 py-4 sm:px-7">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-wrap items-center gap-3">
              <label id="lock-control" class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
                <input id="lock-toggle" type="checkbox" class="peer sr-only">
                <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
                <span id="pin-toggle-text">Lock with PIN</span>
              </label>

              <div id="pin-field-wrap" class="hidden">
                <div class="relative">
                  <label for="share-pin" class="sr-only">Secret PIN</label>
                  <input
                    id="share-pin"
                    type="password"
                    minlength="__MIN_PIN_LENGTH__"
                    maxlength="__MAX_PIN_LENGTH__"
                    autocomplete="new-password"
                    placeholder="Secret PIN"
                    class="w-40 rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 pr-9 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                  >
                  <button type="button" data-action="toggle-create-pin" class="absolute inset-y-0 right-0 grid w-9 place-items-center text-neutral-600 transition hover:text-white" aria-label="Show or hide PIN">
                    <svg viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-eye"></use></svg>
                  </button>
                </div>
              </div>

              <label id="burn-control" class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
                <input id="burn-toggle" type="checkbox" class="peer sr-only">
                <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
                <span>Open once</span>
              </label>

              <div id="custom-code-field-wrap" class="hidden">
                <label for="custom-code-input" class="sr-only">Custom share code</label>
                <input
                  id="custom-code-input"
                  type="text"
                  maxlength="12"
                  autocomplete="off"
                  autocapitalize="characters"
                  placeholder="Custom code (optional)"
                  class="w-44 rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                >
              </div>

              <label for="create-ttl-select" class="sr-only">Disappears in</label>
              <select id="create-ttl-select" class="w-auto rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/50">
                <option value="">Disappears in default time</option>
                <option value="600">Disappears in 10 minutes</option>
                <option value="3600">Disappears in 1 hour</option>
                <option value="86400">Disappears in 1 day</option>
                <option value="259200">Disappears in 3 days</option>
                <option value="604800">Disappears in 7 days</option>
                <option value="2592000">Disappears in 30 days</option>
              </select>
            </div>

            <button
              id="create-submit"
              type="submit"
              class="primary-action inline-flex min-w-40 items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg data-button-icon viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-arrow-right"></use></svg>
              <span data-button-label>Save note</span>
            </button>
          </div>
        </div>
      <label id="encryption-option" class="encryption-option" hidden><input id="encrypt-note-toggle" type="checkbox"><span><strong>Encrypt in this browser</strong><small>Share the complete link, including its key. The service cannot recover a lost key. Encrypted drops stay off Nearby.</small></span></label></form>
    </section>`;
}

function notesSectionFragment(tabPanel?: string): string {
  const tabAttr = tabPanel ? ` data-tab-panel="${tabPanel}"` : "";
  return String.raw`<article id="notes-section"${tabAttr} class="glass-panel overflow-hidden rounded-2xl">
        <div class="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <h2 id="available-title" class="text-base font-semibold text-white">Nearby</h2>
            <div class="mt-1 flex items-center gap-2 text-xs text-neutral-600">
              <span id="item-count">0 items</span>
              <span aria-hidden="true">·</span>
              <span id="last-refreshed">Loading</span>
            </div>
          </div>
          <button id="refresh-button" type="button" data-action="refresh-items" class="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Refresh local board">
            <svg data-refresh-icon viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-refresh"></use></svg>
          </button>
        </div>

        <div class="notes-toolbar">
          <label class="sr-only" for="notes-search">Search notes</label>
          <input id="notes-search" class="notes-search" type="search" placeholder="Search nearby drops…" autocomplete="off">
          <label class="sr-only" for="notes-filter">Filter notes</label>
          <select id="notes-filter" class="filter-select">
            <option value="all">All text drops</option>
            <option value="mine">Mine</option>
            <option value="received">Received</option>
            <option value="open">Open</option>
            <option value="locked">Locked</option>
          </select>
        </div>

        <div class="p-4 sm:p-5">
          <div id="board-loading" class="py-12 text-center">
            <span class="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-[var(--line)] border-t-violet-400"></span>
          </div>

          <div id="board-empty" class="hidden py-12 text-center">
            <p id="available-empty-text" class="text-sm text-neutral-500">No shared text yet.</p>
            <a href="/text" class="mt-3 inline-block text-sm font-medium text-[var(--accent)] transition hover:text-[var(--accent)]">Create the first one</a>
          </div>

          <div id="board-list" class="hidden grid-cols-1 gap-2"></div>
        </div>
      </article>`;
}

function joinCardFragment(tabPanel?: string): string {
  const tabAttr = tabPanel ? ` data-tab-panel="${tabPanel}"` : "";
  return String.raw`<aside id="join-card"${tabAttr} class="glass-panel h-fit rounded-2xl p-5 max-w-md">
        <h2 id="open-code-title" class="text-base font-semibold text-white">Receive a code</h2>
        <form id="join-form" class="mt-4 space-y-3" novalidate>
          <label for="join-code" class="sr-only">Share code</label>
          <input
            id="join-code"
            type="text"
            maxlength="2048"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="ABC123"
            class="w-full rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3 text-center font-mono text-lg font-semibold uppercase tracking-[.22em] text-white outline-none placeholder:tracking-[.16em] placeholder:text-slate-700 focus:border-cyan-400/50"
          >
          <button id="open-code-button-text" type="submit" class="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-white">
            Receive share
          </button>
        <button id="receive-paste" type="button" class="action-btn w-full">Paste a code or share link</button></form>
        <button id="scan-qr-text" type="button" data-action="open-scanner" class="mt-3 w-full rounded-md px-4 py-2.5 text-sm text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200">
          Scan QR instead
        </button>
      </aside>`;
}

function filesUploadFragmentInner(): string {
  return String.raw`<div class="flex items-center justify-between border-b border-white/[.07] px-5 py-5 sm:px-7">
        <div>
          <h2 id="files-section-title" class="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Share a file</h2>
          <p id="files-section-subtitle" class="mt-1 text-xs text-slate-500">Available for {duration} · deleted automatically</p>
        </div>
        <span id="files-temporary-badge" class="hidden rounded-full border border-cyan-400/15 bg-cyan-400/[.06] px-3 py-1 text-xs text-cyan-200/80 sm:inline">Temporary</span>
      </div>

      <form id="file-upload-form" class="px-5 py-6 sm:px-7" novalidate>
        <label id="files-drop-zone" for="file-input" class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 px-4 py-10 text-center transition hover:border-cyan-400/40">
          <svg viewBox="0 0 24 24" class="h-7 w-7 text-slate-500"><use href="#i-upload"></use></svg>
          <span id="files-drop-hint" class="text-sm text-slate-400">Drag and drop a file here, or click to choose one.</span>
          <span id="file-input-name" class="text-xs text-slate-600"></span>
          <input id="file-input" name="file" type="file" multiple class="sr-only">
        </label>
        <div id="staged-files-list" class="mt-3 hidden grid gap-1 text-xs text-slate-400"></div>
        <p id="staged-files-total" class="mt-1 hidden text-xs text-slate-500"></p>

        <div class="mt-4 flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <label for="file-title" class="sr-only">Title (optional)</label>
            <input id="file-title" name="title" type="text" maxlength="80" autocomplete="off" placeholder="Title (optional)" class="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
            <label id="file-lock-control" class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
              <input id="file-lock-toggle" type="checkbox" class="peer sr-only">
              <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
              <span>PIN</span>
            </label>
            <div id="file-pin-field-wrap" class="hidden">
              <label for="file-pin" class="sr-only">Secret PIN</label>
              <input id="file-pin" type="password" minlength="__MIN_PIN_LENGTH__" maxlength="__MAX_PIN_LENGTH__" autocomplete="new-password" placeholder="Secret PIN" class="w-32 rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
            </div>
            <label id="file-burn-control" class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
              <input id="file-burn-toggle" type="checkbox" class="peer sr-only">
              <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
              <span>Open once</span>
            </label>
            <div id="file-custom-code-field-wrap" class="hidden">
              <label for="file-custom-code-input" class="sr-only">Custom share code</label>
              <input id="file-custom-code-input" type="text" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="Custom code (optional)" class="w-40 rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
            </div>
            <label for="file-ttl-select" class="sr-only">Disappears in</label>
            <select id="file-ttl-select" class="w-auto rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/50">
              <option value="">Disappears in default time</option>
              <option value="600">Disappears in 10 minutes</option>
              <option value="3600">Disappears in 1 hour</option>
              <option value="86400">Disappears in 1 day</option>
              <option value="259200">Disappears in 3 days</option>
              <option value="604800">Disappears in 7 days</option>
              <option value="2592000">Disappears in 30 days</option>
            </select>
          </div>
          <button id="file-upload-submit" type="submit" class="primary-action inline-flex min-w-40 items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50">
            <span data-button-label id="files-upload-button-text">Upload file</span>
          </button>
        </div>
      <p id="upload-progress" class="upload-progress" role="status" aria-live="polite" hidden></p></form>

      <p id="files-privacy-note" class="px-5 pb-5 text-xs leading-5 text-neutral-600 sm:px-7">Only titles appear in the nearby list. Use a PIN for private files.</p>`;
}

function filesBoardFragmentInner(): string {
  return String.raw`<div class="flex items-center justify-between gap-4">
          <h3 id="files-available-title" class="text-base font-semibold text-white">Files nearby</h3>
          <button id="files-refresh-button" type="button" data-action="refresh-files" class="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Refresh files board">
            <svg viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-refresh"></use></svg>
          </button>
        </div>
        <div id="files-board-empty" class="hidden py-10 text-center">
          <p id="files-empty-text" class="text-sm text-neutral-500">No shared files yet.</p>
        </div>
        <div id="files-board-list" class="mt-3 hidden grid-cols-1 gap-2"></div>`;
}

function pageTextContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="hero-kicker">Send text</p>
          <h1 class="mt-2 text-3xl font-bold text-white sm:text-4xl">Drop a note, share it anywhere</h1>
          <p class="mt-2 max-w-xl text-sm leading-6 text-slate-500">Type or paste your text below. Add a PIN if it's private, or turn on "Open once" so it deletes itself the moment someone opens it. Then send the code, link or QR to whoever needs it.</p>
        </div>
        <a href="/nearby" class="hero-secondary-action shrink-0">See what's nearby →</a>
      </div>
      <div class="mb-6 grid gap-3 sm:grid-cols-3">
        <div class="flex items-start gap-2 text-xs leading-5 text-slate-500"><span class="step-number shrink-0 !h-6 !w-6 !text-xs">1</span><span>Type or paste your text</span></div>
        <div class="flex items-start gap-2 text-xs leading-5 text-slate-500"><span class="step-number shrink-0 !h-6 !w-6 !text-xs">2</span><span>Lock it or set it to open once, if you want</span></div>
        <div class="flex items-start gap-2 text-xs leading-5 text-slate-500"><span class="step-number shrink-0 !h-6 !w-6 !text-xs">3</span><span>Save, then share the code, link or QR</span></div>
      </div>
      <div id="maintenance-banner" class="hidden mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">Maintenance mode is active. Existing drops can still be opened, but new ones are disabled.</div>
      ${createCardFragment()}
      <p id="create-privacy-note" class="mt-3 text-xs leading-5 text-neutral-600">
        Only titles appear in the nearby list. Use a PIN for private content.
      </p>
    </div>`;
}

function pageFilesContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="hero-kicker">Send files</p>
          <h1 class="mt-2 text-3xl font-bold text-white sm:text-4xl">Drop a file, share it anywhere</h1>
          <p class="mt-2 max-w-xl text-sm leading-6 text-slate-500">Drag one or several files in, or click to choose them. Add a PIN for anything private, then send the code, link or QR -- the files disappear on their own once the timer runs out.</p>
        </div>
        <a href="/nearby" class="hero-secondary-action shrink-0">See what's nearby →</a>
      </div>
      <div class="mb-6 grid gap-3 sm:grid-cols-3">
        <div class="flex items-start gap-2 text-xs leading-5 text-slate-500"><span class="step-number shrink-0 !h-6 !w-6 !text-xs">1</span><span>Choose or drop one or more files</span></div>
        <div class="flex items-start gap-2 text-xs leading-5 text-slate-500"><span class="step-number shrink-0 !h-6 !w-6 !text-xs">2</span><span>Lock it or set it to open once, if you want</span></div>
        <div class="flex items-start gap-2 text-xs leading-5 text-slate-500"><span class="step-number shrink-0 !h-6 !w-6 !text-xs">3</span><span>Upload, then share the code, link or QR</span></div>
      </div>
      <section id="files-card" class="glass-panel app-shadow overflow-hidden rounded-2xl">
        ${filesUploadFragmentInner()}
      </section>
    </div>`;
}

function pageNearbyContent(): string {
  return String.raw`<div class="mx-auto max-w-4xl">
    <header class="nearby-heading">
      <div><p class="hero-kicker">Nearby drops</p><h1 class="mt-2 text-3xl font-bold sm:text-4xl">A shared space for this connection</h1>
      <p class="feature-hint">Devices using the same public IP can see this board. Shared gateways and VPNs can affect who appears nearby. Use a PIN for private drops.</p></div>
      <div class="note-actions"><a href="/text" class="action-btn primary-action">Share text</a><a href="/files" class="action-btn">Share files</a></div>
    </header>
    <section class="nearby-panel" aria-label="Nearby drops">
      <div class="nearby-status"><span id="nearby-total" role="status">Loading nearby drops…</span><span class="feature-hint">Refreshes every 10 seconds</span><button type="button" class="action-btn" data-action="refresh-items">Refresh</button></div>
      <label class="sr-only" for="nearby-search">Search nearby drops</label><input id="nearby-search" class="input-field" type="search" placeholder="Search by title or code…" autocomplete="off">
      <div class="nearby-filters" role="group" aria-label="Filter drops">
        <button type="button" data-nearby-filter="all" aria-pressed="true">All drops</button><button type="button" data-nearby-filter="note" aria-pressed="false">Text</button><button type="button" data-nearby-filter="file" aria-pressed="false">Files</button><button type="button" data-nearby-filter="mine" aria-pressed="false">Mine</button><button type="button" data-nearby-filter="open" aria-pressed="false">Open</button><button type="button" data-nearby-filter="locked" aria-pressed="false">PIN locked</button>
      </div>
      <div id="nearby-drop-list" class="nearby-list"></div>
    </section>
    <div class="hidden-force" aria-hidden="true">${notesSectionFragment()}<section id="files-board-section">${filesBoardFragmentInner()}</section></div>
  </div>`;
}

function pageReceiveContent(): string {
  return String.raw`<div class="mx-auto max-w-md">
      <div class="mb-6 text-center">
        <p class="hero-kicker">Receive</p>
        <h1 class="mt-2 text-3xl font-bold text-white">Open a drop</h1>
        <p class="mt-2 text-sm leading-6 text-slate-500">Enter the code you were given, or scan the QR from the sender's device. If it's locked, you'll be asked for the PIN before it opens.</p>
      </div>
      ${joinCardFragment()}
      <p class="mt-4 text-center text-xs leading-5 text-neutral-600">Don't have a code? Check what's already <a href="/nearby" class="text-[var(--accent)]">nearby on this Wi-Fi</a> instead.</p>
    </div>`;
}

function pageQrContent(): string {
  return String.raw`<div id="qrtool-page" class="mx-auto max-w-md">
      <div class="mb-6">
        <p id="qrtool-eyebrow" class="hero-kicker">Utility</p>
        <h1 id="qrtool-title" class="mt-2 text-3xl font-bold text-white">QR code for any link</h1>
        <p id="qrtool-subtitle" class="mt-2 text-sm leading-6 text-slate-500">Paste any URL below and get an instant, scannable QR code -- useful for sharing a link out loud, printing it, or sending it to a device without typing. Nothing is saved or sent to a server; it's generated entirely in your browser.</p>
      </div>
      <div class="glass-panel rounded-2xl p-5">
        <form id="qrtool-form" class="grid gap-3" novalidate>
          <label for="qrtool-input" class="sr-only">Link</label>
          <input id="qrtool-input" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com" class="form-field" required>
          <button id="qrtool-button-text" type="submit" class="primary-action px-4 py-3 font-semibold">Generate QR</button>
        </form>
        <div id="qrtool-output-wrap" class="mt-4 hidden text-center">
          <div id="qrtool-output" class="mx-auto grid place-items-center rounded-xl bg-white p-4" style="width:fit-content"></div>
          <button id="qrtool-download-text" type="button" data-action="download-qrtool" class="mt-3 rounded-md border border-[var(--line)] px-4 py-2 text-sm">Download PNG</button>
        </div>
      </div>
    </div>`;
}

function guideTip(title: string, body: string): string {
  return `<li class="flex gap-2"><span class="text-[var(--accent)]">•</span><span><strong class="text-white">${title}</strong> -- ${body}</span></li>`;
}

function guideCard(title: string, body: string): string {
  return `<div class="glass-panel rounded-2xl p-5">
          <h3 class="font-semibold text-white">${title}</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">${body}</p>
        </div>`;
}

function pageGuideContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <p id="guide-eyebrow" class="hero-kicker">How to use</p>
      <h1 id="guide-title" class="mt-2 text-3xl font-bold text-white sm:text-4xl">Share in four steps</h1>
      <p class="mt-2 text-sm leading-6 text-slate-500">AirText moves text and files between your own devices, or to someone else, without sign-ups, cables or chat apps. Every drop follows the same four steps, and it removes itself when its time is up.</p>
      <div class="mt-6 glass-panel rounded-2xl p-5 sm:p-7">
        <div class="guide-step"><span class="step-number">1</span><div><strong id="guide-step1-title">Create</strong><p id="guide-step1-text" class="mt-1 text-sm text-slate-500">Add a title, then type or paste your note, or choose the files you want to send.</p></div></div>
        <div class="guide-step"><span class="step-number">2</span><div><strong id="guide-step2-title">Protect</strong><p id="guide-step2-text" class="mt-1 text-sm text-slate-500">Optionally lock it with a PIN, set it to open once, or choose how long it stays.</p></div></div>
        <div class="guide-step"><span class="step-number">3</span><div><strong id="guide-step3-title">Share</strong><p id="guide-step3-text" class="mt-1 text-sm text-slate-500">Send the link, read out the short code, or let someone scan the QR code.</p></div></div>
        <div class="guide-step"><span class="step-number">4</span><div><strong id="guide-step4-title">Receive</strong><p id="guide-step4-text" class="mt-1 text-sm text-slate-500">Open it on any device. Drops also appear in Nearby for people on the same Wi-Fi while they are active.</p></div></div>
      </div>

      <h2 class="mt-10 text-xl font-bold text-white">Before you start</h2>
      <ul class="mt-4 grid gap-3 text-sm leading-6 text-slate-500">
        ${guideTip("No account needed", "you can send and receive right away. Signing in is optional and only adds extras such as a My Drops page.")}
        ${guideTip("Works everywhere", "phones, tablets and computers, in any modern browser. Nothing to install.")}
        ${guideTip("Temporary by design", "every drop has a countdown. When it reaches zero the drop is gone for everyone.")}
      </ul>

      <h2 class="mt-10 text-xl font-bold text-white">Sending text</h2>
      <ol class="mt-4 grid gap-3 text-sm leading-6 text-slate-500">
        <li><strong class="text-white">1. Open <a href="/text" class="text-[var(--accent)]">Send text</a>.</strong> Give your note a short title so you can recognise it later.</li>
        <li><strong class="text-white">2. Type or paste your text.</strong> Good for passwords you need to move between devices, addresses, links, snippets, meeting notes or anything you would otherwise message to yourself.</li>
        <li><strong class="text-white">3. Pick your options.</strong> Add a PIN, turn on Open once, or choose a shorter expiry. All of these are optional.</li>
        <li><strong class="text-white">4. Press share.</strong> You will get a link, a short code and a QR code. Copy whichever suits the situation.</li>
      </ol>

      <h2 class="mt-10 text-xl font-bold text-white">Sending files</h2>
      <ol class="mt-4 grid gap-3 text-sm leading-6 text-slate-500">
        <li><strong class="text-white">1. Open <a href="/files" class="text-[var(--accent)]">Send files</a>.</strong> The page shows the largest file size and the number of files allowed for you.</li>
        <li><strong class="text-white">2. Choose or drag your files in.</strong> You can add several at once, such as a batch of photos or a few documents.</li>
        <li><strong class="text-white">3. Add a PIN or Open once if you want.</strong> Then share the link, code or QR the same way as with text.</li>
        <li><strong class="text-white">4. Wait for the upload to finish</strong> before closing the page, especially on mobile data or slow Wi-Fi.</li>
      </ol>

      <h2 class="mt-10 text-xl font-bold text-white">Receiving a drop</h2>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        ${guideCard("From a link", "Just open it. The drop loads straight away, or asks for the PIN first if the sender added one.")}
        ${guideCard("From a code", 'Go to <a href="/receive" class="text-[var(--accent)]">Receive</a>, type the short code and press open. Codes are not case sensitive.')}
        ${guideCard("From a QR code", "Use the scan button on the Receive page, or your phone camera, and point it at the QR code on the other screen.")}
        ${guideCard("From Nearby", 'Open <a href="/nearby" class="text-[var(--accent)]">Nearby</a> on the same Wi-Fi and tap any drop you see. No code needed.')}
      </div>

      <h2 class="mt-10 text-xl font-bold text-white">Nearby: sharing on the same Wi-Fi</h2>
      <p class="mt-3 text-sm leading-6 text-slate-500">When you share a drop, it can show up in Nearby for other devices using the same internet connection, for example everyone on your home, office or campus Wi-Fi. It is the quickest way to send something to the laptop next to you without typing a code.</p>
      <ul class="mt-4 grid gap-3 text-sm leading-6 text-slate-500">
        ${guideTip("Only titles are listed", "people nearby see the title, the type and who shared it (if they were signed in), not the contents.")}
        ${guideTip("Shared connections", "public Wi-Fi, mobile hotspots and VPNs can put many strangers on the same network. If that applies, add a PIN.")}
        ${guideTip("Remote sharing still works", "people on a different network can open your drop with the link, code or QR code.")}
        ${guideTip("Open once and encrypted drops stay private", "they are never listed in Nearby.")}
      </ul>

      <h2 class="mt-10 text-xl font-bold text-white">Protection options</h2>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        ${guideCard("PIN lock", "Only people who know the PIN can read the drop, even if they have the link. Tell the PIN to the recipient separately, ideally by another route. The PIN is kept in a scrambled form and cannot be read back, so keep a note of it yourself.")}
        ${guideCard("Open once", "The drop deletes itself after its first recipient opens it. For files, each attachment can be downloaded once. Use it for sensitive items you only want seen a single time. Do not open your own link to test it, as that may use it up.")}
        ${guideCard("Extra encryption", "Where available, you can lock the text with a key that stays on your device. The full link carries the key, so always share the complete link. If the key is lost, the text cannot be recovered by anyone, including us.")}
        ${guideCard("Expiry", "Choose how long the drop should last. A shorter time means less exposure. After expiry it cannot be opened by anyone.")}
      </div>

      <h2 class="mt-10 text-xl font-bold text-white">Managing your drops</h2>
      <ul class="mt-4 grid gap-3 text-sm leading-6 text-slate-500">
        ${guideTip("Without an account", "the browser you used to create a drop can edit or delete it from the Recent drops list and the drop window. Clearing your browser data removes that ability, so delete anything important before you do.")}
        ${guideTip("With an account", "your drops are listed under My Drops and can be opened, edited, shared to Nearby or deleted from any device where you are signed in.")}
        ${guideTip("Edit", "change the title, text, PIN, expiry or files after sharing. The link and code stay the same.")}
        ${guideTip("Delete", "removes the drop straight away for everyone. This cannot be undone.")}
        ${guideTip("Signing out", "removes the saved drop shortcuts from that browser, which is useful on shared computers.")}
      </ul>

      <h2 class="mt-10 text-xl font-bold text-white">Accounts</h2>
      <p class="mt-3 text-sm leading-6 text-slate-500">Accounts are created by the site administrator, so there is no public sign-up. If you need one, use the request option on the <a href="/login" class="text-[var(--accent)]">sign-in page</a>. Depending on your plan an account can give you larger files, longer-lasting drops, your own short codes and a My Drops page that follows you across devices.</p>

      <h2 class="mt-10 text-xl font-bold text-white">Good habits</h2>
      <ul class="mt-4 grid gap-3 text-sm leading-6 text-slate-500">
        ${guideTip("Use a PIN for anything private", "especially on shared or public networks.")}
        ${guideTip("Share links with the right person only", "anyone holding the link or code can open an unlocked drop.")}
        ${guideTip("Check the countdown", "if you need something for longer, create a new drop before the old one expires.")}
        ${guideTip("Keep originals", "AirText is for passing things along, not for storing them. Keep your own copy of anything you cannot afford to lose.")}
        ${guideTip("Delete when finished", "once the other person has what they need, remove the drop.")}
      </ul>

      <h2 class="mt-10 text-xl font-bold text-white">Troubleshooting</h2>
      <div class="mt-4 grid gap-3">
        ${guideCard("The code says it is not found", "Check for typing mistakes, such as 0 and O. The drop may have expired, been deleted, or been an Open once drop that was already opened.")}
        ${guideCard("I cannot see a drop in Nearby", "Both devices must be on the same internet connection. Mobile data and Wi-Fi count as different networks. Press Refresh, and ask the sender for the link or code if it still does not appear.")}
        ${guideCard("The PIN is not accepted", "Check the PIN with the sender. After several wrong tries you will be asked to wait a moment before trying again.")}
        ${guideCard("My upload fails", "Check the size and number of files against the limits shown on the page, and make sure your connection stays on until the upload finishes.")}
        ${guideCard("I get a message about too many attempts", "Wait a minute and try again. This limit protects drops from being guessed and clears quickly.")}
        ${guideCard("The Edit and Delete buttons are missing", "They only show for the person who created the drop. Use the same browser, or sign in to the account that created it.")}
      </div>

      <p class="mt-8 text-sm leading-6 text-slate-500">Still have questions? Read the <a href="/faq" class="text-[var(--accent)]">FAQ</a> or <a href="/about" class="text-[var(--accent)]">learn more about AirText</a>.</p>
    </div>`;
}


function pageAboutContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <p id="about-eyebrow" class="hero-kicker">About</p>
      <h1 id="about-title" class="mt-2 text-3xl font-bold text-white sm:text-4xl">Simple sharing without an account</h1>
      <p id="about-text" class="mt-3 text-sm leading-6 text-slate-500">AirText is a lightweight way to move temporary text and files between nearby or remote devices. Create a drop, share a link, code or QR, and it disappears on its own -- no account, no clutter.</p>
      <div class="developer-card mt-6">
        <span class="developer-avatar" aria-hidden="true">✦</span>
        <div>
          <strong id="developer-name">Farhan Ali</strong>
          <p id="developer-role" class="text-xs text-slate-500">Web Developer</p>
        </div>
      </div>
      <p id="developer-bio" class="mt-3 text-sm leading-6 text-slate-500">Building practical, privacy-conscious tools for the web.</p>
      <div id="about-social-links" class="social-links mt-4"></div>
      <div id="developer-contact-links" class="mt-4 flex flex-wrap gap-3 text-sm"></div>
    </div>`;
}

const FAQ_ENTRIES: Array<{ question: string; answer: string }> = [
  { question: "What is AirText?", answer: "AirText is a simple way to send text and files to another device or person. You create a drop, share a link, short code or QR code, and it disappears on its own after a set time." },
  { question: "Is AirText free?", answer: "Yes. Anyone can send text or files without paying and without creating an account." },
  { question: "Do I need an account?", answer: "No. Sharing works fully without one. Signing in is optional and adds a My Drops page, management from any device, and extra options on some plans." },
  { question: "How do I get an account?", answer: "Accounts are created by the site administrator and there is no public sign-up. Use the request option on the sign-in page and explain what you need it for." },
  { question: "How do I send something?", answer: "Open Send text or Send files, add your content, press share, then give the other person the link, code or QR code. The Guide page walks through every step." },
  { question: "How do I receive something?", answer: "Open the link, type the code on the Receive page, scan the QR code, or tap the drop in Nearby if you are on the same Wi-Fi." },
  { question: "How long do drops last?", answer: "Every drop shows a countdown. The default time is set by the site and can differ for text and files. You can often choose a shorter time when you create it." },
  { question: "What happens when a drop expires?", answer: "It becomes unavailable straight away and is cleaned up shortly afterwards. Nobody can open it again, including the person who created it." },
  { question: "What is the Nearby page?", answer: "Nearby lists drops shared from the same internet connection as yours, such as the same home, office or campus Wi-Fi. You see titles only and can open a drop with one tap." },
  { question: "Why do I see drops from other people in Nearby?", answer: "Everyone on the same connection sees the same Nearby list. On public Wi-Fi, hotspots or VPNs that can include strangers, so use a PIN for anything private." },
  { question: "Why can't I see my drop in Nearby on another device?", answer: "Both devices need to use the same internet connection. Wi-Fi and mobile data count as different networks. Open Once and encrypted drops are never listed in Nearby, so share those with the link or code." },
  { question: "What is a PIN for?", answer: "A PIN locks your drop so only someone who knows it can open the contents, even if they have the link or code. Share the PIN separately from the link." },
  { question: "What if I forget the PIN?", answer: "PINs cannot be read back or reset. You can edit the drop if you created it and set a new PIN, or simply create a new drop." },
  { question: "What does Open once mean?", answer: "The drop deletes itself after its first recipient opens it. For files, each attachment can be downloaded once. It is useful for sensitive items you want seen a single time." },
  { question: "Why did my Open once drop disappear?", answer: "Someone, possibly you, has already opened it. Avoid opening your own link to test it. Create a new drop if you need to send it again." },
  { question: "Is my content private?", answer: "Drops are only reachable with their link or code, and a PIN adds another lock. Where available you can also add extra encryption in your browser. We do not read drop contents. See the Privacy policy for details." },
  { question: "What is extra encryption?", answer: "An optional setting that scrambles your text on your device before it is sent. The key travels inside the full link, so share the complete link. If the key is lost, nobody can recover the text." },
  { question: "Can anyone else open my drop?", answer: "Anyone who has your link or code can open an unlocked drop, so share them only with the right people. Add a PIN for more protection." },
  { question: "Are there file size limits?", answer: "Yes. The upload page shows the largest single file, the number of files and the total size allowed for you. Some signed-in plans allow more." },
  { question: "Which file types can I send?", answer: "Most common files such as photos, documents and archives. A few risky file types may be blocked. If a file is refused, the page tells you why." },
  { question: "Can I choose my own code?", answer: "If your plan allows it, yes. Pick a short custom code instead of a random one when you create a drop. Codes must be unique and use letters and numbers only." },
  { question: "Can I edit or delete a drop after sharing?", answer: "Yes, if you created it. Without an account this works from the same browser you used. With an account it works from any device where you are signed in." },
  { question: "I cleared my browser data and lost access to my drop. What now?", answer: "Drops created without an account can only be managed from the browser that made them. If you cannot get back in, the drop will simply expire on its own, or you can create a new one." },
  { question: "What is the difference between anonymous and signed-in drops?", answer: "Anonymous drops show no owner. Signed-in drops show your name and badge, appear in My Drops, and can be managed from any device." },
  { question: "What does the badge next to a name mean?", answer: "It shows the type of account that shared the drop, such as Admin, Pro or Member, so you know who it came from." },
  { question: "What happens when I sign out?", answer: "You are signed out and the saved drop shortcuts and keys are removed from that browser. Drops linked to your account stay safe and appear again when you sign back in." },
  { question: "I see a message about too many attempts. What should I do?", answer: "Wait a minute and try again. Limits on guessing codes and PINs protect everyone's drops, and they clear quickly for normal use." },
  { question: "Does AirText work on phones?", answer: "Yes. It works in any modern browser on phones, tablets and computers, and you can scan QR codes with your camera." },
  { question: "Can I use AirText to store files long term?", answer: "No. Drops are temporary and may be removed at any time. Always keep your own copy of anything important." },
  { question: "What should I not share?", answer: "Anything illegal, harmful or that belongs to someone else. See the Terms of service for the full rules." },
  { question: "How do I report a problem or give feedback?", answer: "Use the feedback form in the menu. You can include an email address if you would like a reply, but it is optional." },
  { question: "Where can I read the rules and privacy details?", answer: "The Terms of service and Privacy policy pages, linked in the footer, explain them in plain language." },
];

function pageFaqContent(): string {
  const items = FAQ_ENTRIES.map(
    (entry) => `<details class="faq-item rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <summary class="cursor-pointer list-none text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
            <span class="mr-2 inline-block"><svg viewBox="0 0 24 24" class="inline h-4 w-4 -translate-y-0.5 opacity-60"><use href="#i-chevron"></use></svg></span>${escapeHtml(entry.question)}
          </summary>
          <p class="mt-3 text-sm leading-6 text-slate-500">${escapeHtml(entry.answer)}</p>
        </details>`,
  ).join("\n        ");

  return `<div class="mx-auto max-w-3xl">
      <p class="hero-kicker">FAQ</p>
      <h1 class="mt-2 text-3xl font-bold text-white sm:text-4xl">Frequently asked questions</h1>
      <p class="mt-2 text-sm leading-6 text-slate-500">Answers to the questions we hear most about AirText.</p>
      <div id="faq-list" class="mt-6 grid gap-3">
        ${items}
      </div>
    </div>`;
}

function buildFaqStructuredData(): string {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ENTRIES.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
  return `<script type="application/ld+json">${safeJsonForScript(structuredData)}</script>`;
}

function legalBlock(heading: string, paragraphs: string[]): string {
  return `<h2 class="text-base font-semibold text-white">${heading}</h2>
        ${paragraphs.map((text) => `<p>${text}</p>`).join("\n        ")}`;
}

function legalList(heading: string, intro: string, items: string[]): string {
  return `<h2 class="text-base font-semibold text-white">${heading}</h2>
        <p>${intro}</p>
        <ul class="grid gap-2 pl-5" style="list-style:disc">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function pagePrivacyContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <p class="hero-kicker">Legal</p>
      <h1 class="mt-2 text-3xl font-bold text-white sm:text-4xl">Privacy policy</h1>
      <p class="mt-2 text-xs text-slate-500">Last updated: November 2026</p>
      <div class="mt-6 grid gap-5 text-sm leading-7 text-slate-400">
        <p>AirText is built to keep as little about you as possible. This page explains in plain language what we keep, why we keep it, and the choices you have.</p>

        ${legalList("The short version", "In a few lines:", [
          "You can use AirText without an account or any personal details.",
          "We do not read your drops and we do not sell your information.",
          "There are no advertising or tracking cookies.",
          "Drops are temporary and are removed after they expire.",
        ])}

        ${legalList("What we keep", "Depending on how you use AirText, we may keep:", [
          "<strong>Your drops</strong> -- the text, files, title, expiry time and any PIN or open-once setting you chose.",
          "<strong>Account details</strong> (only if you have an account) -- your name, email address, plan and a protected form of your password.",
          "<strong>Basic usage figures</strong> -- things like the type of device, how a drop was opened and which feature was used, with no names attached.",
          "<strong>Feedback</strong> -- the message you send and, only if you choose, an email address for a reply.",
          "<strong>Safety records</strong> -- short-lived records of failed attempts and important account actions, used to keep the service secure.",
        ])}

        ${legalBlock("Anonymous and signed-in drops", [
          "Drops made without an account are not linked to who you are. Your browser remembers which drops it created so you can manage them.",
          "If you are signed in, your drops are linked to your account so you can manage them from any device. Your display name and badge may be shown next to the drops you share.",
        ])}

        ${legalBlock("PINs and passwords", [
          "PINs and passwords are stored in a scrambled form that cannot be turned back into the original. We can check whether a PIN or password is right, but we cannot tell you what it is. This also means a forgotten PIN cannot be recovered.",
        ])}

        ${legalBlock("Extra encryption", [
          "Where it is available, you can encrypt your text on your own device before it is sent. The key stays in the full link you share, not on our side, so a code on its own cannot unlock it. If the key is lost, the text cannot be recovered by anyone, including us.",
          "Titles and expiry times are not encrypted. Because the service provides the page you use, this option cannot protect against the service itself being tampered with.",
        ])}

        ${legalBlock("Your network and Nearby", [
          "To show you drops shared on your Wi-Fi, we group visitors by their internet connection. We never keep your IP address in a readable form. It is scrambled before it is used, and the result cannot be turned back into an address.",
          "Nearby shows only titles, type and who shared a drop, not the contents. People on the same connection see the same list, so use a PIN on shared or public networks.",
        ])}

        ${legalBlock("How we use information", [
          "We use it only to run AirText: to deliver drops, keep accounts working, prevent misuse, fix problems and understand which features are useful. We do not sell it, rent it or use it for advertising.",
        ])}

        ${legalBlock("How long we keep things", [
          "Drops are removed after their expiry time, or sooner if you delete them or they were set to open once. Cleanup runs automatically and is retried if it fails.",
          "Safety and activity records are kept for a short period, around 30 days, and never include the text of your drops. Backups that exist for reliability may hold older data briefly before they are cleared.",
          "Account details stay until the account is removed. Feedback is kept until it has been dealt with.",
        ])}

        ${legalBlock("Cookies and storage", [
          "If you sign in, we set one secure cookie to keep you signed in. Your browser also stores small items so it can remember the drops you created and your theme choice. Signing out clears the saved drop shortcuts.",
          "We do not use advertising cookies, cross-site tracking or third-party trackers. Everything AirText needs is served from our own site.",
        ])}

        ${legalBlock("Who can see your information", [
          "Administrators can manage accounts and see technical details such as sizes and expiry times, but cannot read the content of your drops. We may share information if the law requires it, or to protect the service and its users from serious abuse.",
          "AirText runs on a trusted cloud hosting provider that stores and delivers data on our behalf.",
        ])}

        ${legalList("Your choices", "You are in control of what you share:", [
          "Delete any drop you created at any time.",
          "Use a PIN, open-once or a shorter expiry to limit who sees a drop and for how long.",
          "Sign out on shared devices.",
          "Ask us, using the feedback form, about your account details or to have your account removed.",
        ])}

        ${legalBlock("Security", [
          "We use sensible safeguards such as secure connections, protected passwords, request limits and automatic expiry. No online service can promise perfect security, so please do not share anything you cannot risk losing.",
        ])}

        ${legalBlock("Children", [
          "AirText is not aimed at young children. If you believe a child has shared personal details with us, tell us and we will remove them.",
        ])}

        ${legalBlock("Changes to this policy", [
          "We may update this page as AirText changes. The date at the top shows when it was last revised. Continuing to use AirText means you accept the current version.",
        ])}

        ${legalBlock("Questions", [
          "If you have a question about this policy, use the feedback form linked in the menu below.",
        ])}
      </div>
    </div>`;
}

function pageTermsContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <p class="hero-kicker">Legal</p>
      <h1 class="mt-2 text-3xl font-bold text-white sm:text-4xl">Terms of service</h1>
      <p class="mt-2 text-xs text-slate-500">Last updated: November 2026</p>
      <div class="mt-6 grid gap-5 text-sm leading-7 text-slate-400">
        <p>AirText is a free, temporary sharing tool. By using it you agree to these terms. If you do not agree, please do not use the service.</p>

        ${legalBlock("Using AirText", [
          "You may use AirText to send and receive text and files for lawful, personal or business purposes. You must be old enough to form a binding agreement where you live, or have a parent or guardian's permission.",
        ])}

        ${legalList("Acceptable use", "You agree not to use AirText to:", [
          "Share anything illegal, harmful, threatening, abusive or hateful.",
          "Share malware, or content designed to damage or break into other people's devices or accounts.",
          "Share material that infringes copyright, privacy or other rights, or that you have no right to share.",
          "Share private information about other people without their permission.",
          "Send spam, scams or misleading content.",
          "Try to guess codes or PINs, access other people's drops, or bypass limits and protections.",
          "Overload, disrupt or reverse engineer the service, or use automated tools to abuse it.",
        ])}

        ${legalBlock("Your content, your responsibility", [
          "You are responsible for everything you share, whether through an account or without one. We do not review drops before they are shared and administrators cannot read their contents. You confirm that you have the right to share what you upload.",
          "You keep ownership of your content. You give us only the permission needed to store it, deliver it to the people you share it with, and delete it when it expires.",
        ])}

        ${legalBlock("Links, codes and PINs", [
          "Anyone who has the link or code of an unlocked drop can open it. Anyone who also knows the PIN can open a locked one. Keeping them safe is up to you. We cannot recover lost PINs or lost encryption keys.",
          "Open-once drops are removed after their first recipient opens them and cannot be brought back.",
        ])}

        ${legalBlock("Nearby", [
          "Drops shared on your network may appear in Nearby to other people using the same internet connection. Please think before sharing on public or shared networks and use a PIN where needed.",
        ])}

        ${legalBlock("Temporary storage", [
          "Drops are removed automatically when they expire and may also be removed earlier for safety or maintenance. AirText is meant for passing things along, not for keeping them. Always keep your own copy of anything important.",
        ])}

        ${legalBlock("Limits", [
          "File size, number of files, storage, lifetime and request limits apply and may differ by plan. We may change them at any time to keep the service fair and reliable.",
        ])}

        ${legalBlock("Accounts", [
          "Accounts are created by an administrator and there is no public sign-up. Keep your password private and tell us if you think someone else has used your account. You are responsible for activity under your account.",
          "We may disable, change or remove an account, for example for misuse, inactivity or to protect the service.",
        ])}

        ${legalBlock("Removing content and ending access", [
          "We may remove any drop, or block access to AirText, if we believe these terms have been broken, the law requires it, or it is needed to protect people or the service. We may do this without notice.",
        ])}

        ${legalBlock("No warranty", [
          "AirText is provided \"as is\" and \"as available\". We do not promise it will always be available, error free or secure, that a drop will be delivered, or that it will last until the countdown ends. Do not rely on it for anything you cannot afford to lose.",
        ])}

        ${legalBlock("Limit of liability", [
          "To the fullest extent the law allows, we are not responsible for lost or exposed data, missed deliveries, downtime or any indirect or consequential loss arising from your use of AirText. Nothing in these terms limits rights you have that cannot be limited by law.",
        ])}

        ${legalBlock("Privacy", [
          "Our Privacy policy explains what we keep and why. It forms part of these terms.",
        ])}

        ${legalBlock("Changes to the service and these terms", [
          "We may change, add, pause or end features, or update these terms, at any time. The date at the top shows the latest revision. Continuing to use AirText after a change means you accept it.",
        ])}

        ${legalBlock("Contact", [
          "Questions about these terms can be sent through the feedback form linked in the menu below.",
        ])}
      </div>
    </div>`;
}

function pageLoginContent(): string {
  return String.raw`<div class="mx-auto mt-6 max-w-md">
      <section class="glass-panel rounded-2xl p-6">
        <p class="hero-kicker">Account</p>
        <h1 class="mt-3 text-3xl font-bold text-white">Sign in</h1>
        <p class="mt-2 text-sm leading-6 text-slate-500">Sign in with your Pro or Member account.</p>
        <form id="login-form" class="mt-6 grid gap-3">
          <input id="login-email" class="form-field" type="email" autocomplete="username" placeholder="Email">
          <input id="login-password" class="form-field" type="password" autocomplete="current-password" placeholder="Password">
          <button id="login-submit" type="submit" class="primary-action px-4 py-3 font-semibold">Sign in</button>
          <p id="login-error" class="hidden text-sm text-red-400"></p>
        </form>
        <p id="login-admin-hint" class="mt-4 hidden rounded-lg border border-[var(--line)] bg-black/20 p-3 text-sm text-slate-300">
          Your account has admin access -- <a href="/admin" class="font-semibold text-[var(--accent)]">open the admin panel →</a>
        </p>
        <p class="mt-6 border-t border-[var(--line)] pt-5 text-sm leading-6 text-slate-500">
          Don't have an account? Account creation is invite-only -- request one from your <a href="/account" class="text-[var(--accent)]">account page</a>.
        </p>
      </section>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Route table + assembly                                              */
/* ------------------------------------------------------------------ */

const ROUTE_SEO: Record<string, { title: string; description: string }> = {
  "/text": { title: "Send text", description: "Create a temporary text drop, protect it with a PIN and share it with a link, code or QR. No account needed." },
  "/files": { title: "Send files", description: "Upload one or more files, get a link, code or QR, and share them temporarily. Files delete automatically." },
  "/nearby": { title: "Nearby drops", description: "See what's been shared on your Wi-Fi right now -- text and files, refreshed live." },
  "/receive": { title: "Receive a drop", description: "Enter a share code or scan a QR to open a text or file drop that was sent to you." },
  "/qr": { title: "Free QR code generator", description: "Paste any link and get an instant QR code. Nothing is saved or sent to a server." },
  "/guide": { title: "How AirText works", description: "Learn how to create, protect and share a temporary drop in four simple steps." },
  "/faq": { title: "FAQ", description: "Answers to common questions about AirText: pricing, accounts, expiry, privacy, PINs and more." },
  "/about": { title: "About", description: "AirText is a lightweight way to move temporary text and files between devices, without an account." },
  "/privacy": { title: "Privacy policy", description: "How AirText handles your data: hashed PINs, hashed IP addresses, storage, encryption and cookies." },
  "/terms": { title: "Terms of service", description: "The plain-English rules for using AirText." },
  "/login": { title: "Sign in", description: "Sign in to your AirText account to manage your drops." },
};

function getMainContentForPath(path: string): string {
  switch (path) {
    case "/text":
      return pageTextContent();
    case "/files":
      return pageFilesContent();
    case "/nearby":
      return pageNearbyContent();
    case "/receive":
      return pageReceiveContent();
    case "/qr":
      return pageQrContent();
    case "/guide":
      return pageGuideContent();
    case "/faq":
      return pageFaqContent();
    case "/about":
      return pageAboutContent();
    case "/privacy":
      return pagePrivacyContent();
    case "/terms":
      return pageTermsContent();
    case "/login":
      return pageLoginContent();
    case "/account":
      return pageAccountContent();
    default:
      // "/", "/s/:code", "/f/:code", "/admin" all render the same full
      // home experience for their (hidden, when applicable) #public-app
      // content -- unchanged from before this restructure.
      return pageHomeContent();
  }
}

/* --- Tier avatar/badge helpers (V3-PLAN 3.3/3.5) ---
 * Rank 0 = Admin, 1 = Pro, 2 = Member (see V3-PLAN.md section 0.2 role
 * rename). Shared by the nav dropdown (renderNavAuthSlot) and the /account
 * "My Drops" header card -- one hash-based avatar so a given displayName
 * always renders the same color everywhere it appears server-side. The
 * client (main.js) implements the identical hash/initials algorithm for
 * places it renders an avatar itself (drawer, post-login dashboard swap). */
function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(hash, 31) + input.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function tierRingClass(rank: number): string {
  if (rank === 0) return "tier-ring-admin";
  if (rank === 1) return "tier-ring-pro";
  return "tier-ring-member";
}

function tierBadgeClass(rank: number): string {
  if (rank === 0) return "tier-badge-admin";
  if (rank === 1) return "tier-badge-pro";
  return "tier-badge-member";
}

function tierBadgeIcon(rank: number): string {
  if (rank === 0) return "\u{1F451}"; // crown
  if (rank === 1) return "★"; // star
  return "●"; // solid dot
}

function renderTierAvatar(displayName: string, rank: number, extraClass = ""): string {
  const initials = escapeHtml(getInitials(displayName));
  const hue = hashHue(displayName);
  const ringClass = tierRingClass(rank);
  return `<span class="tier-avatar ${ringClass}${extraClass ? ` ${extraClass}` : ""}" style="background: hsl(${hue} 62% 42%)">${initials}</span>`;
}

function renderNavAuthSlot(viewer: RenderPageOptions["viewer"]): string {
  if (!viewer) {
    return `<a href="/login" data-nav-path="/login" class="primary-action px-4 py-2 text-sm font-semibold">Sign in</a>`;
  }
  const trimmedName = viewer.displayName.trim() || "Account";
  const roleLabel = escapeHtml(viewer.roleName || (viewer.rank === 0 ? "Admin" : viewer.rank === 1 ? "Pro" : "Member"));
  const adminLink = viewer.rank === 0
    ? `<a href="/admin" class="block rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">Admin panel</a>`
    : "";
  return `<details class="nav-dropdown desktop-nav-item relative">
      <summary class="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-slate-300 transition hover:text-white [&::-webkit-details-marker]:hidden">
        ${renderTierAvatar(trimmedName, viewer.rank)}
        <span class="max-w-[9rem] truncate text-sm">${escapeHtml(trimmedName)}</span>
        <svg viewBox="0 0 24 24" class="h-3 w-3 opacity-70"><use href="#i-chevron"></use></svg>
      </summary>
      <div class="absolute right-0 top-full z-30 mt-2 min-w-48 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-2xl">
        <div class="flex items-center justify-between gap-2 px-3 py-2">
          <span class="truncate text-sm font-semibold text-white">${escapeHtml(trimmedName)}</span>
          <span class="tier-badge ${tierBadgeClass(viewer.rank)}">${tierBadgeIcon(viewer.rank)} ${roleLabel}</span>
        </div>
        <div class="my-1 border-t border-[var(--line)]"></div>
        <a href="/account" class="block rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">My Drops</a>
        ${adminLink}
        <button type="button" data-action="nav-sign-out" class="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">Sign out</button>
      </div>
    </details>`;
}

const APP_SHELL = `<!doctype html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#141410">
  <meta name="description" content="__SEO_META_DESCRIPTION__">
  <title>__SEO_TITLE__</title>
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  __SEO_EXTRA_HEAD__




</head>

<body class="subtle-grid font-sans antialiased selection:bg-[var(--accent)]/30 selection:text-white">
  ${ICON_SPRITE}
  <div id="public-app">
  ${SITE_HEADER}

  <main class="mx-auto max-w-6xl px-5 py-8 pb-24 sm:px-7 sm:py-12 sm:pb-12">
    __MAIN_CONTENT__
    __RECENT_DROPS__
  </main>

  ${SITE_FOOTER}
  ${MOBILE_BOTTOM_BAR}
  </div>

  ${SIDE_DRAWER}

  __ADMIN_APP_SECTION__

  ${SHARED_MODALS}


</body>
</html>`;

const THEME_DETECT_SCRIPT = String.raw`(function () {
      try {
        var configured = window.__AIRTEXT_BOOT__.defaultTheme || "system";
        var saved = localStorage.getItem("airtext_theme");
        var choice = saved || configured;
        var resolved = choice === "system"
          ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
          : choice;
        document.documentElement.setAttribute("data-theme", resolved);
      } catch (error) {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    })();`;

export interface RenderPageOptions {
  initialShareCode: string;
  initialFileShareCode: string;
  initialShareVia: "link" | "qr";
  initialAdmin: boolean;
  initialAccount: boolean;
  minPinLength: number;
  maxPinLength: number;
  canonicalPath: string;
  requestOrigin: string;
  /** Effective limits for the current viewer (anonymous or logged-in) --
   *  lets the client show/hide vanity-code and encryption options without
   *  a round-trip, and know the right file/batch caps to validate against
   *  client-side before submitting. */
  viewerLimits: EffectiveLimits;
  viewer: { displayName: string; roleName: string; rank: number } | null;
}

export function renderPage(settings: SiteSettings, options: RenderPageOptions): string {
  const bootData = {
    ...settings,
    initialShareCode: options.initialShareCode,
    initialFileShareCode: options.initialFileShareCode,
    initialShareVia: options.initialShareVia,
    initialAdmin: options.initialAdmin,
    initialAccount: options.initialAccount,
    minPinLength: options.minPinLength,
    maxPinLength: options.maxPinLength,
    ttlSeconds: options.viewerLimits.ttlSeconds,
    maxTextLength: options.viewerLimits.maxTextLength,
    maxFileSizeMB: options.viewerLimits.maxFileSizeMB,
    maxBatchTotalMB: options.viewerLimits.maxBatchTotalMB,
    maxFilesPerBatch: options.viewerLimits.maxFilesPerBatch,
    fileTtlSeconds: options.viewerLimits.fileTtlSeconds,
    allowCustomCode: options.viewerLimits.allowCustomCode,
    allowClientEncryption: options.viewerLimits.allowClientEncryption,
    viewer: options.viewer,
  };

  const routeSeo = ROUTE_SEO[options.canonicalPath];
  const seoTitle = routeSeo ? `${routeSeo.title} — ${settings.appName}` : (settings.seoSiteTitle || `${settings.appName} — ${settings.tagline}`);
  const seoDescription = routeSeo ? routeSeo.description : (settings.seoMetaDescription || settings.tagline || "");

  const replacements: Record<string, string> = {
    // __MAIN_CONTENT__ and __NAV_AUTH_SLOT__ must be substituted before the
    // length placeholders below, since the injected page content itself
    // contains __MAX_TITLE_LENGTH__ / __MAX_TEXT_LENGTH__ / pin-length
    // tokens that still need to be replaced afterwards.
    "__MAIN_CONTENT__": getMainContentForPath(options.canonicalPath),
    "__RECENT_DROPS__": ["/", "/text", "/files"].includes(options.canonicalPath) ? '<section id="recent-drops" class="mx-auto mt-8 max-w-4xl" hidden></section>' : "",
    "__ADMIN_APP_SECTION__": options.initialAdmin ? ADMIN_APP_SECTION : "",
    "__NAV_AUTH_SLOT__": renderNavAuthSlot(options.viewer),
    "__APP_NAME__": escapeHtml(settings.appName),
    "__SEO_TITLE__": escapeHtml(seoTitle),
    "__SEO_META_DESCRIPTION__": escapeHtml(seoDescription),
    "__SEO_EXTRA_HEAD__": buildSeoHeadExtras(settings, options, seoTitle, seoDescription),
    "__MIN_PIN_LENGTH__": String(options.minPinLength),
    "__MAX_PIN_LENGTH__": String(options.maxPinLength),
    "__MAX_TITLE_LENGTH__": String(settings.maxTitleLength),
    "__MAX_TEXT_LENGTH__": String(settings.maxTextLength),
  };

  let html = APP_SHELL;
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replaceAll(placeholder, value);
  }

  const headExtras = [
    `<link rel="stylesheet" href="/assets/main.css">`,
    `<script>window.__AIRTEXT_BOOT__ = ${safeJsonForScript(bootData)};</script>`,
    `<script>${THEME_DETECT_SCRIPT}</script>`,
  ].join("\n  ");
  html = html.replace("</head>", `${headExtras}\n</head>`);
  html = html.replace("</body>", `<script type="module" src="/assets/main.js"></script>\n</body>`);
  return html;
}

/** Ported verbatim from airtext-worker-modern.js:2605-2649, extended for
 *  per-route title/description (V3 routing) and FAQPage structured data. */
function buildSeoHeadExtras(settings: SiteSettings, options: RenderPageOptions, title: string, description: string): string {
  if (!settings.seoEnabled) return "";
  const origin = String(settings.seoCanonicalBaseUrl || options.requestOrigin || "").replace(/\/$/, "");
  const canonicalPath = !options.canonicalPath || options.canonicalPath === "/" ? "" : options.canonicalPath;
  const canonicalUrl = origin ? `${origin}${canonicalPath}` : "";
  const ogImage = String(settings.seoOgImageUrl || "");

  const parts: string[] = [];
  if (settings.seoKeywords) {
    parts.push(`<meta name="keywords" content="${escapeHtml(settings.seoKeywords)}">`);
  }
  parts.push(`<meta name="robots" content="${escapeHtml(settings.seoRobotsDirective || "index, follow")}">`);
  if (settings.seoGoogleSiteVerification) {
    parts.push(`<meta name="google-site-verification" content="${escapeHtml(settings.seoGoogleSiteVerification)}">`);
  }
  if (canonicalUrl) {
    parts.push(`<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  }
  parts.push(`<meta property="og:site_name" content="${escapeHtml(settings.appName)}">`);
  parts.push(`<meta property="og:title" content="${escapeHtml(title)}">`);
  parts.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
  parts.push(`<meta property="og:type" content="website">`);
  if (canonicalUrl) parts.push(`<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
  if (ogImage) parts.push(`<meta property="og:image" content="${escapeHtml(ogImage)}">`);
  parts.push(`<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">`);
  if (settings.seoTwitterHandle) parts.push(`<meta name="twitter:site" content="${escapeHtml(settings.seoTwitterHandle)}">`);
  parts.push(`<meta name="twitter:title" content="${escapeHtml(title)}">`);
  parts.push(`<meta name="twitter:description" content="${escapeHtml(description)}">`);
  if (ogImage) parts.push(`<meta name="twitter:image" content="${escapeHtml(ogImage)}">`);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.appName,
    description,
    ...(origin ? { url: origin } : {}),
  };
  parts.push(`<script type="application/ld+json">${safeJsonForScript(structuredData)}</script>`);

  if (options.canonicalPath === "/faq") {
    parts.push(buildFaqStructuredData());
  }

  return parts.join("\n  ");
}
