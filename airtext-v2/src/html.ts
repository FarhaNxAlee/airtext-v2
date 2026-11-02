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
        <button type="button" data-action="open-drawer" class="icon-button" aria-label="Open menu">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-menu"></use></svg>
        </button>
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
        <a href="/privacy" class="text-violet-400">Privacy policy</a>
        <a href="/terms" class="text-violet-400">Terms of service</a>
      </div>
      <div id="drawer-auth-slot" class="mt-5">
        <a href="/login" class="inline-block text-violet-400">Sign in →</a>
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
            <span id="modal-lock-badge" class="rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"></span>
            <span id="modal-expiry" data-expires="0" class="rounded border border-white/10 px-2 py-1 text-[10px] text-neutral-500">Expires soon</span>
          </div>
          <h2 id="modal-title" class="mt-3 truncate text-xl font-semibold text-white">Shared text</h2>
        </div>
        <button type="button" data-action="close-item-modal" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg>
        </button>
      </div>

      <div class="scrollbar-thin max-h-[calc(92vh-80px)] overflow-y-auto p-5 sm:p-6">
        <div id="modal-loading" class="py-14 text-center">
          <span class="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-violet-400"></span>
          <p class="mt-3 text-sm text-neutral-500">Opening…</p>
        </div>

        <div id="modal-error" class="hidden border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"></div>

        <form id="unlock-form" class="hidden" novalidate>
          <div class="rounded-xl border border-white/[.07] bg-black/20 p-5">
            <h3 class="font-medium text-white">PIN required</h3>
            <p class="mt-1 text-sm text-neutral-500">Enter the PIN provided by the sender.</p>
            <label for="unlock-pin" class="sr-only">Secret PIN</label>
            <input id="unlock-pin" type="password" maxlength="__MAX_PIN_LENGTH__" autocomplete="current-password" placeholder="Secret PIN" class="mt-5 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-400/50">
            <button id="unlock-submit" type="submit" class="mt-3 w-full rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50">
              Unlock
            </button>
          </div>
        </form>

        <div id="modal-content" class="hidden">
          <p id="modal-shared-by" class="mb-2 hidden text-xs text-neutral-500"></p>
          <div class="overflow-hidden rounded-xl border border-white/[.07] bg-black/20">
            <div class="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <p class="text-xs text-neutral-600">TEXT</p>
              <button type="button" data-action="copy-text" class="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition hover:bg-white/5 hover:text-white">Copy</button>
            </div>
            <pre id="modal-text" class="linkified-text scrollbar-thin max-h-[48vh] overflow-auto whitespace-pre-wrap break-words p-5 font-sans text-sm leading-7 text-slate-200"></pre>
          </div>

          <div class="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" data-action="show-current-qr" class="flex-1 rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-white">
              Code & QR
            </button>
            <button id="edit-item-button" type="button" data-action="open-edit-item-modal" class="hidden flex-1 items-center justify-center rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">
              Edit
            </button>
            <button id="delete-item-button" type="button" data-action="delete-current-item" class="hidden flex-1 items-center justify-center rounded-md border border-red-500/20 px-4 py-3 text-sm text-red-300 transition hover:bg-red-500/10">
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
            <span id="file-modal-lock-badge" class="rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"></span>
            <span id="file-modal-expiry" class="rounded border border-white/10 px-2 py-1 text-[10px] text-neutral-500">Expires soon</span>
          </div>
          <h2 id="file-modal-title" class="mt-3 truncate text-xl font-semibold text-white">Shared file</h2>
        </div>
        <button type="button" data-action="close-file-modal" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5"><use href="#i-close"></use></svg>
        </button>
      </div>

      <div class="scrollbar-thin max-h-[calc(92vh-80px)] overflow-y-auto p-5 sm:p-6">
        <div id="file-modal-loading" class="py-14 text-center">
          <span class="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-violet-400"></span>
          <p class="mt-3 text-sm text-neutral-500">Opening…</p>
        </div>

        <div id="file-modal-error" class="hidden border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"></div>

        <form id="file-unlock-form" class="hidden" novalidate>
          <div class="rounded-xl border border-white/[.07] bg-black/20 p-5">
            <h3 class="font-medium text-white">PIN required</h3>
            <p class="mt-1 text-sm text-neutral-500">Enter the PIN provided by the sender.</p>
            <label for="file-unlock-pin" class="sr-only">Secret PIN</label>
            <input id="file-unlock-pin" type="password" maxlength="__MAX_PIN_LENGTH__" autocomplete="current-password" placeholder="Secret PIN" class="mt-5 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-400/50">
            <button id="file-unlock-submit" type="submit" class="mt-3 w-full rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50">
              Unlock
            </button>
          </div>
        </form>

        <div id="file-modal-content" class="hidden">
          <p id="file-modal-shared-by" class="mb-2 hidden text-xs text-neutral-500"></p>
          <div id="file-modal-list" class="grid gap-2"></div>
          <div class="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" data-action="show-current-file-qr" class="flex-1 rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-white">Code & QR</button>
            <button id="edit-file-button" type="button" data-action="open-edit-file-modal" class="hidden flex-1 items-center justify-center rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Edit</button>
            <button id="delete-file-button" type="button" data-action="delete-current-file" class="hidden flex-1 items-center justify-center rounded-md border border-red-500/20 px-4 py-3 text-sm text-red-300 transition hover:bg-red-500/10">Delete</button>
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
        <input id="edit-item-title" type="text" maxlength="__MAX_TITLE_LENGTH__" placeholder="Title" class="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
        <label for="edit-item-text" class="sr-only">Text</label>
        <textarea id="edit-item-text" rows="8" maxlength="__MAX_TEXT_LENGTH__" placeholder="Leave blank to keep the current text" class="scrollbar-thin mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"></textarea>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input id="edit-item-lock-toggle" type="checkbox" class="peer sr-only">
            <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
            <span>Lock with PIN</span>
          </label>
          <div id="edit-item-pin-field-wrap" class="hidden">
            <label for="edit-item-pin" class="sr-only">New PIN</label>
            <input id="edit-item-pin" type="password" minlength="__MIN_PIN_LENGTH__" maxlength="__MAX_PIN_LENGTH__" autocomplete="new-password" placeholder="Leave blank to keep current PIN" class="w-56 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
          </div>
          <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input id="edit-item-burn-toggle" type="checkbox" class="peer sr-only">
            <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
            <span>Open once</span>
          </label>
          <label for="edit-item-ttl-select" class="sr-only">Expiry</label>
          <select id="edit-item-ttl-select" class="w-auto rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/50">
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
          <button type="button" data-action="close-edit-item-modal" class="flex-1 rounded-md border border-white/10 px-5 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Cancel</button>
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
        <input id="edit-file-title" type="text" maxlength="80" placeholder="Title" class="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
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
            <input id="edit-file-pin" type="password" minlength="__MIN_PIN_LENGTH__" maxlength="__MAX_PIN_LENGTH__" autocomplete="new-password" placeholder="Leave blank to keep current PIN" class="w-56 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
          </div>
          <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input id="edit-file-burn-toggle" type="checkbox" class="peer sr-only">
            <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
            <span>Open once</span>
          </label>
          <label for="edit-file-ttl-select" class="sr-only">Expiry</label>
          <select id="edit-file-ttl-select" class="w-auto rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/50">
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
          <button type="button" data-action="close-edit-file-modal" class="flex-1 rounded-md border border-white/10 px-5 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Cancel</button>
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
        <button type="button" data-action="copy-link" class="rounded-md bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-400">Copy link</button>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <button type="button" data-action="copy-code" class="w-full rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Copy code</button>
        <button id="web-share-button" type="button" data-action="web-share" class="hidden w-full rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Share…</button>
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
            <div class="flex items-start gap-3"><span class="tier-badge tier-badge-pro shrink-0"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5"><use href="#i-warning"></use></svg></span><div><strong class="text-sm font-semibold text-white">Extra encryption</strong><p class="mt-1 text-xs leading-5 text-slate-500">Optional client-side encryption on PIN-locked notes.</p></div></div>
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
          <div class="admin-panel-head"><h2 class="font-bold text-white">My notes</h2><a href="/text" class="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold">+ New note</a></div>
          <div id="account-notes-list" class="admin-panel-body grid gap-2"></div>
        </div>

        <div class="admin-panel">
          <div class="admin-panel-head"><h2 class="font-bold text-white">My files</h2><a href="/files" class="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold">+ New file</a></div>
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

    <div class="admin-wrap">
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

          <details class="mt-4 border-t border-white/10 pt-4">
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
        <a href="/text" class="glass-panel rounded-2xl p-6 transition hover:border-violet-400/40">
          <span class="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-logo"></use></svg></span>
          <h3 class="mt-4 text-lg font-semibold text-white">Text &amp; notes</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">Paste a note, lock it with a PIN, send it with a code, link or QR.</p>
        </a>
        <a href="/files" class="glass-panel rounded-2xl p-6 transition hover:border-violet-400/40">
          <span class="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-upload"></use></svg></span>
          <h3 class="mt-4 text-lg font-semibold text-white">Files &amp; photos</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">Send one or several files at once. Auto-deletes when the timer runs out.</p>
        </a>
        <a href="/qr" class="glass-panel rounded-2xl p-6 transition hover:border-violet-400/40">
          <span class="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-qr-grid"></use></svg></span>
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
          <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-refresh"></use></svg></span>
          <h3 class="mt-3 font-semibold text-white">Auto-deletes</h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">Every drop disappears on its own -- nothing to clean up.</p>
        </div>
        <div class="glass-panel rounded-2xl p-5 text-center">
          <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-warning"></use></svg></span>
          <h3 class="mt-3 font-semibold text-white">PIN-locked</h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">Lock anything sensitive so only someone with the PIN can open it.</p>
        </div>
        <div class="glass-panel rounded-2xl p-5 text-center">
          <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-wifi"></use></svg></span>
          <h3 class="mt-3 font-semibold text-white">Any device</h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">Works between phones, laptops and tablets on any network.</p>
        </div>
        <div class="glass-panel rounded-2xl p-5 text-center">
          <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300"><svg viewBox="0 0 24 24" class="h-6 w-6"><use href="#i-eye"></use></svg></span>
          <h3 class="mt-3 font-semibold text-white">No signup</h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">Start sharing immediately -- an account is never required.</p>
        </div>
      </div>
    </section>

    <section id="wifi-live-strip" class="mt-16 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-4 text-sm text-slate-400">
      <span class="inline-flex h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true"></span>
      <span><strong id="wifi-live-count" class="text-white">0</strong> <span id="wifi-live-label">drops active on your Wi-Fi right now</span></span>
      <a href="/nearby" class="text-xs font-semibold text-violet-400">View nearby →</a>
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
      <p class="mt-5 text-center text-sm"><a href="/faq" class="font-medium text-violet-400">See all FAQs →</a></p>
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
          <span class="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300 ring-1 ring-inset ring-[var(--line)]">
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
          <div class="flex items-center gap-4 border-b border-white/10 pb-4 focus-within:border-cyan-400/40">
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
                    class="w-40 rounded-lg border border-white/10 bg-black/25 px-3 py-2 pr-9 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
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
                  class="w-44 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                >
              </div>

              <label for="create-ttl-select" class="sr-only">Disappears in</label>
              <select id="create-ttl-select" class="w-auto rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/50">
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
      </form>
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
            <option value="all">All notes</option>
            <option value="mine">Mine</option>
            <option value="received">Received</option>
            <option value="open">Open</option>
            <option value="locked">Locked</option>
          </select>
        </div>

        <div class="p-4 sm:p-5">
          <div id="board-loading" class="py-12 text-center">
            <span class="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-violet-400"></span>
          </div>

          <div id="board-empty" class="hidden py-12 text-center">
            <p id="available-empty-text" class="text-sm text-neutral-500">No shared text yet.</p>
            <a href="/text" class="mt-3 inline-block text-sm font-medium text-violet-400 transition hover:text-violet-300">Create the first one</a>
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
            maxlength="12"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="ABC123"
            class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-center font-mono text-lg font-semibold uppercase tracking-[.22em] text-white outline-none placeholder:tracking-[.16em] placeholder:text-slate-700 focus:border-cyan-400/50"
          >
          <button id="open-code-button-text" type="submit" class="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white">
            Receive share
          </button>
        </form>
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
            <input id="file-title" name="title" type="text" maxlength="80" autocomplete="off" placeholder="Title (optional)" class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
            <label id="file-lock-control" class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
              <input id="file-lock-toggle" type="checkbox" class="peer sr-only">
              <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
              <span>PIN</span>
            </label>
            <div id="file-pin-field-wrap" class="hidden">
              <label for="file-pin" class="sr-only">Secret PIN</label>
              <input id="file-pin" type="password" minlength="__MIN_PIN_LENGTH__" maxlength="__MAX_PIN_LENGTH__" autocomplete="new-password" placeholder="Secret PIN" class="w-32 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
            </div>
            <label id="file-burn-control" class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
              <input id="file-burn-toggle" type="checkbox" class="peer sr-only">
              <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
              <span>Open once</span>
            </label>
            <div id="file-custom-code-field-wrap" class="hidden">
              <label for="file-custom-code-input" class="sr-only">Custom share code</label>
              <input id="file-custom-code-input" type="text" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="Custom code (optional)" class="w-40 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
            </div>
            <label for="file-ttl-select" class="sr-only">Disappears in</label>
            <select id="file-ttl-select" class="w-auto rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/50">
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
      </form>

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
      <div class="mb-8">
        <p class="hero-kicker">Nearby</p>
        <h1 class="mt-2 text-3xl font-bold text-white sm:text-4xl">What's on your Wi-Fi right now</h1>
        <p class="mt-2 text-sm leading-6 text-slate-500">Anyone on this Wi-Fi can see what's listed below. Use a PIN for anything private.</p>
      </div>

      <div class="mb-3 flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold text-white">Text</h2>
        <a href="/text" class="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-violet-400/40 hover:text-white">Share text →</a>
      </div>
      ${notesSectionFragment()}

      <div class="mb-3 mt-8 flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold text-white">Files</h2>
        <a href="/files" class="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-violet-400/40 hover:text-white">Share files →</a>
      </div>
      <section id="files-board-section" class="glass-panel overflow-hidden rounded-2xl">
        <div class="px-5 py-5 sm:px-7">
          ${filesBoardFragmentInner()}
        </div>
      </section>
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
      <p class="mt-4 text-center text-xs leading-5 text-neutral-600">Don't have a code? Check what's already <a href="/nearby" class="text-violet-400">nearby on this Wi-Fi</a> instead.</p>
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

function pageGuideContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <p id="guide-eyebrow" class="hero-kicker">How to use</p>
      <h1 id="guide-title" class="mt-2 text-3xl font-bold text-white sm:text-4xl">Share in four steps</h1>
      <p class="mt-2 text-sm leading-6 text-slate-500">Whether it's text or files, every drop follows the same four steps from create to receive.</p>
      <div class="mt-6 glass-panel rounded-2xl p-5 sm:p-7">
        <div class="guide-step"><span class="step-number">1</span><div><strong id="guide-step1-title">Create</strong><p id="guide-step1-text" class="mt-1 text-sm text-slate-500">Add a title and paste or type your note, or choose a file to send.</p></div></div>
        <div class="guide-step"><span class="step-number">2</span><div><strong id="guide-step2-title">Protect</strong><p id="guide-step2-text" class="mt-1 text-sm text-slate-500">Optionally lock it with a PIN before saving, or set it to open once.</p></div></div>
        <div class="guide-step"><span class="step-number">3</span><div><strong id="guide-step3-title">Share</strong><p id="guide-step3-text" class="mt-1 text-sm text-slate-500">Send the link, short code or QR.</p></div></div>
        <div class="guide-step"><span class="step-number">4</span><div><strong id="guide-step4-title">Receive</strong><p id="guide-step4-text" class="mt-1 text-sm text-slate-500">Opening it adds the drop to that Wi-Fi until it disappears.</p></div></div>
      </div>

      <h2 class="mt-10 text-xl font-bold text-white">Sending text vs. files</h2>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="glass-panel rounded-2xl p-5">
          <h3 class="font-semibold text-white">Text (<a href="/text" class="text-violet-400">/text</a>)</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">Paste or type directly into the box -- no file needed. Good for codes, notes, addresses, or anything you'd otherwise copy-paste over chat.</p>
        </div>
        <div class="glass-panel rounded-2xl p-5">
          <h3 class="font-semibold text-white">Files (<a href="/files" class="text-violet-400">/files</a>)</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">Upload one or several files at once, up to your plan's size limit. Good for photos, documents, or anything that isn't plain text.</p>
        </div>
      </div>

      <h2 class="mt-10 text-xl font-bold text-white">A few tips</h2>
      <ul class="mt-4 grid gap-3 text-sm leading-6 text-slate-500">
        <li class="flex gap-2"><span class="text-[var(--accent)]">•</span><span><strong class="text-white">PIN</strong> -- lock a drop so only someone with the PIN can open it. Anyone can still see it listed as "Locked" on <a href="/nearby" class="text-violet-400">Nearby</a>, but not its contents.</span></li>
        <li class="flex gap-2"><span class="text-[var(--accent)]">•</span><span><strong class="text-white">Open once</strong> -- the drop deletes itself the instant someone else opens it. Good for anything you only want seen a single time.</span></li>
        <li class="flex gap-2"><span class="text-[var(--accent)]">•</span><span><strong class="text-white">Custom code</strong> -- Pro and Member accounts can pick their own short code instead of a random one, making it easier to say out loud or remember.</span></li>
        <li class="flex gap-2"><span class="text-[var(--accent)]">•</span><span><strong class="text-white">Expiry</strong> -- choose how long a drop sticks around (10 minutes, 1 hour, 1 day) instead of using the default.</span></li>
        <li class="flex gap-2"><span class="text-[var(--accent)]">•</span><span><strong class="text-white">Nearby</strong> -- anyone on the same Wi-Fi can see what's been shared without a code, so use a PIN for anything you don't want visible to others on that network.</span></li>
      </ul>

      <p class="mt-8 text-sm leading-6 text-slate-500">Still have questions? Read the <a href="/faq" class="text-violet-400">FAQ</a> or <a href="/about" class="text-violet-400">learn more about AirText</a>.</p>
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
  { question: "Is AirText free?", answer: "Yes. Anyone can send text or files without paying and without creating an account." },
  { question: "Do I need an account?", answer: "No. Anonymous sharing works fully without one. Signing in (invite-only) adds a My Drops dashboard, custom links on some plans, and higher limits." },
  { question: "How long do drops last?", answer: "Every drop shows a \"disappears in\" countdown. The exact duration is set by the site admin and can differ for text versus files." },
  { question: "What happens after a drop expires?", answer: "It is deleted from storage automatically -- there is no way to recover an expired drop, by you or anyone else." },
  { question: "Is my content encrypted or private?", answer: "PINs and account passwords are never stored in plain text -- they're one-way hashed. For PIN-locked notes, some plans additionally encrypt the text in your browser before it's ever sent. See the Privacy policy for details." },
  { question: "What's a PIN for?", answer: "\"Lock it\" with a PIN so only someone who knows the PIN can open your drop, even if they have the link or code." },
  { question: "What's \"Open once\" for?", answer: "An optional setting that deletes the drop the moment someone else opens it for the first time -- useful for sharing something sensitive exactly one time." },
  { question: "Are there file size limits?", answer: "Yes. The site admin sets a per-file and a per-batch size limit, shown on the upload page before you send. Some signed-in plans allow larger uploads." },
  { question: "Can I choose my own link?", answer: "If your plan allows it, yes -- pick your own short code instead of a random one when creating a drop." },
  { question: "What's the difference between anonymous and signed-in drops?", answer: "Anonymous drops show no owner information and can only be managed from the browser that created them. Signed-in drops appear in your My Drops dashboard and can be managed from any device." },
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

function pagePrivacyContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <p class="hero-kicker">Legal</p>
      <h1 class="mt-2 text-3xl font-bold text-white sm:text-4xl">Privacy policy</h1>
      <div class="mt-6 grid gap-5 text-sm leading-7 text-slate-400">
        <p>AirText is built to hold as little about you as possible. This page explains, plainly, what is stored and why.</p>

        <h2 class="text-base font-semibold text-white">What we store</h2>
        <p>Drops (text notes and uploaded files) are stored in our database (Cloudflare D1) and, for files, our object storage (Cloudflare R2). Anonymous drops are not linked to any identity. If you're signed in, a drop is linked to your account id so it can appear in your My Drops dashboard.</p>

        <h2 class="text-base font-semibold text-white">PINs and passwords</h2>
        <p>PINs on locked drops and account passwords are never stored in plain text. Each is combined with a random per-item salt and passed through an HMAC-SHA256 one-way hash -- we cannot read your PIN or password back out, only verify a match.</p>

        <h2 class="text-base font-semibold text-white">Client-side encryption</h2>
        <p>For PIN-locked notes, when enabled for your plan, encryption must be explicitly enabled when creating a drop. Standard PIN protection controls access but does not encrypt stored text. Titles and expiry metadata are visible to the service.</p>

        <h2 class="text-base font-semibold text-white">IP addresses and analytics</h2>
        <p>We keep basic, privacy-safe usage analytics (device type, access method, feature used) to understand how AirText is used. Your IP address is never stored raw -- it is combined with the date and one-way hashed before anything is written, and that hash cannot be reversed back into an IP address. The same hashing applies to the "network" grouping used to show what's nearby on your Wi-Fi.</p>

        <h2 class="text-base font-semibold text-white">Automatic deletion</h2>
        <p>Every drop has an expiry time shown as a countdown. Once it passes, the drop (and any uploaded files) is deleted automatically and is not recoverable. Drops can also be set to delete themselves immediately after they're opened once ("Open once"), or deleted manually by their owner beforehand.</p>

        <h2 class="text-base font-semibold text-white">Cookies</h2>
        <p>Signing in to a Pro/Member account or the admin panel sets one HTTP-only, secure session cookie used only to keep you signed in. We do not use cookies for advertising or cross-site tracking, and we do not load any third-party trackers, ad scripts or analytics from other companies -- everything AirText needs (including the QR and scanner libraries) is served from our own domain.</p>

        <h2 class="text-base font-semibold text-white">Feedback</h2>
        <p>The feedback form stores your message and, if you choose to provide one, an email address so we can follow up. It is optional.</p>

        <h2 class="text-base font-semibold text-white">Questions</h2>
        <p>If you have a question about this policy, use the feedback form linked in the menu below.</p>
      </div>
    </div>`;
}

function pageTermsContent(): string {
  return String.raw`<div class="mx-auto max-w-3xl">
      <p class="hero-kicker">Legal</p>
      <h1 class="mt-2 text-3xl font-bold text-white sm:text-4xl">Terms of service</h1>
      <div class="mt-6 grid gap-5 text-sm leading-7 text-slate-400">
        <p>AirText is a free, temporary sharing tool. By using it, you agree to the following.</p>

        <h2 class="text-base font-semibold text-white">Acceptable use</h2>
        <p>Don't use AirText to share illegal content, malware, or material that infringes someone else's rights, and don't try to abuse, overload or circumvent the service's limits or protections.</p>

        <h2 class="text-base font-semibold text-white">Your content, your responsibility</h2>
        <p>You're responsible for whatever you share, whether anonymously or through an account. AirText does not review drop contents before they're shared, and admins cannot see drop contents at all -- only metadata such as size and expiry.</p>

        <h2 class="text-base font-semibold text-white">No warranty</h2>
        <p>AirText is provided "as is," with no guarantee of uptime, delivery, or that a drop will survive exactly until its shown expiry. Don't rely on it for anything you can't afford to lose.</p>

        <h2 class="text-base font-semibold text-white">Accounts</h2>
        <p>Pro and Member accounts are created by an administrator; there is no public signup. An admin may disable or remove an account at their discretion.</p>

        <h2 class="text-base font-semibold text-white">Changes to the service</h2>
        <p>AirText may change, add, remove or discontinue features -- including this one -- at any time, without notice.</p>

        <h2 class="text-base font-semibold text-white">Contact</h2>
        <p>Questions about these terms can be sent through the feedback form linked in the menu below.</p>
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
          Your account has admin access -- <a href="/admin" class="font-semibold text-violet-400">open the admin panel →</a>
        </p>
        <p class="mt-6 border-t border-[var(--line)] pt-5 text-sm leading-6 text-slate-500">
          Don't have an account? Account creation is invite-only -- request one from your <a href="/account" class="text-violet-400">account page</a>.
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

<body class="subtle-grid font-sans antialiased selection:bg-violet-500/30 selection:text-white">
  ${ICON_SPRITE}
  <div id="public-app">
  ${SITE_HEADER}

  <main class="mx-auto max-w-6xl px-5 py-8 pb-24 sm:px-7 sm:py-12 sm:pb-12">
    __MAIN_CONTENT__
  </main>

  ${SITE_FOOTER}
  </div>

  ${MOBILE_BOTTOM_BAR}

  ${SIDE_DRAWER}

  ${ADMIN_APP_SECTION}

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
