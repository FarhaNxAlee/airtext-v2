import { escapeHtml, safeJsonForScript } from "./lib/util";
import type { SiteSettings } from "./lib/settings";

/**
 * Ported from airtext-worker-modern.js APP_HTML (:2728-6255) and
 * renderAppPage()/buildSeoHeadExtras() (:2578-2649). The Tailwind CDN
 * script, the two inline <style> blocks, and the main app <script> have
 * all been moved out to client/style.css and client/main.js (built by
 * Vite into dist/assets/main.css and dist/assets/main.js) -- everything
 * else in this shell is byte-identical to the original template.
 */
const APP_SHELL = String.raw`<!doctype html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#141410">
  <meta name="description" content="__SEO_META_DESCRIPTION__">
  <title>__SEO_TITLE__</title>
  __SEO_EXTRA_HEAD__

  

  
</head>

<body class="subtle-grid font-sans antialiased selection:bg-violet-500/30 selection:text-white">
  <div id="public-app">
  <header class="site-header sticky top-0 z-40 border-b backdrop-blur-xl">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-7">
      <a href="/" class="flex items-center gap-3" aria-label="__APP_NAME__ home">
        <span class="site-logo brand-mark grid h-10 w-10 place-items-center text-white">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h4"/></svg>
        </span>
        <span class="site-wordmark text-xl font-bold tracking-[-.04em]">__APP_NAME__</span>
      </a>

      <nav class="flex items-center gap-2 text-sm" aria-label="Primary navigation">
        <button id="header-create-text" type="button" data-action="focus-create" class="desktop-nav-item rounded-lg px-3 py-2 text-slate-400 transition hover:text-white">Share</button>
        <button id="header-available-text" type="button" data-action="focus-notes" class="desktop-nav-item rounded-lg px-3 py-2 text-slate-400 transition hover:text-white">Available</button>
        <button id="header-open-code-text" type="button" data-action="focus-join" class="desktop-nav-item rounded-lg px-3 py-2 text-slate-400 transition hover:text-white">Open code</button>
        <button id="header-guide-text" type="button" data-action="open-drawer-section" data-drawer-target="guide-drawer-section" class="desktop-nav-item header-secondary-link">Guide</button>
        <button id="header-files-text" type="button" data-action="focus-files" class="desktop-nav-item header-secondary-link">Files</button>
        <button id="header-qrtool-text" type="button" data-action="open-drawer-section" data-drawer-target="qrtool-drawer-section" class="desktop-nav-item header-secondary-link">QR for link</button>
        <button id="header-feedback-text" type="button" data-action="open-drawer-section" data-drawer-target="feedback-drawer-section" class="desktop-nav-item header-secondary-link">Feedback</button>
        <button id="header-about-text" type="button" data-action="open-drawer-section" data-drawer-target="about-drawer-section" class="desktop-nav-item header-secondary-link">About</button>
        <button type="button" data-action="toggle-theme" class="icon-button" aria-label="Toggle light or dark mode">
          <svg data-theme-icon viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>
        </button>
        <button type="button" data-action="open-drawer" class="icon-button" aria-label="Open menu">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <button id="header-new-note-text" type="button" data-action="focus-create" class="primary-action hidden px-5 py-3 font-semibold sm:inline-flex">New note →</button>
      </nav>
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-5 py-8 sm:px-7 sm:py-12">
    <div id="announcement-bar" class="announcement-bar" role="status">
      <span id="announcement-label" class="announcement-label">NEW</span>
      <strong id="announcement-text">Move a note to another network with one secure link, short code or QR scan.</strong>
      <span class="announcement-arrow" aria-hidden="true">↗</span>
    </div>

    <section id="hero-section" class="hero-shell hero-grid">
      <div class="hero-content">
        <p id="hero-eyebrow" class="hero-kicker">Temporary text sharing</p>
        <h1 class="hero-title"><span id="hero-title-primary">Share text.</span><br><span id="hero-title-outline" class="outline-word">Instantly.</span></h1>
        <p id="hero-description" class="hero-copy">Create a temporary note, protect it with a PIN and move it between devices using a code, link or QR. No account required.</p>
        <div class="hero-actions">
          <button id="hero-primary-button" type="button" data-action="focus-create" class="primary-action px-5 py-3 font-semibold">Create a note →</button>
          <button id="hero-secondary-button" type="button" data-action="focus-join" class="hero-secondary-action">Open a code</button>
        </div>
      </div>

      <aside id="hero-panel" class="hero-flow-card" aria-label="AirText sharing flow">
        <div class="hero-flow-glow"></div>
        <div class="relative">
          <p id="hero-panel-eyebrow" class="hero-kicker">How it moves</p>
          <h2 id="hero-panel-title" class="hero-flow-title">One note. Every device.</h2>
          <p id="hero-panel-text" class="hero-flow-copy">Create once, then open it nearby or anywhere using the method that works best.</p>
          <div class="flow-path" aria-hidden="true">
            <span id="hero-panel-step1" class="flow-node active">Create</span>
            <span class="flow-line"></span>
            <span id="hero-panel-step2" class="flow-node">Share</span>
            <span class="flow-line"></span>
            <span id="hero-panel-step3" class="flow-node">Open</span>
          </div>
          <div class="hero-stats">
            <div><strong id="hero-stat1-value">3 ways</strong><span id="hero-stat1-label">Link · Code · QR</span></div>
            <div><strong id="hero-stat2-value">0 accounts</strong><span id="hero-stat2-label">Fast and temporary</span></div>
          </div>
        </div>
      </aside>
    </section>

    <div id="ticker-section" class="ticker" aria-label="AirText features">
      <div class="ticker-track">
        <span data-ticker-item="1">Cross-network sharing</span><span data-ticker-item="2">Automatic expiry</span><span data-ticker-item="3">Clickable links</span><span data-ticker-item="4">Private · Temporary · No account required</span>
        <span data-ticker-item="1">Cross-network sharing</span><span data-ticker-item="2">Automatic expiry</span><span data-ticker-item="3">Clickable links</span><span data-ticker-item="4">Private · Temporary · No account required</span>
      </div>
    </div>

    <div id="maintenance-banner" class="hidden mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">Maintenance mode is active. Existing notes can still be opened, but new notes are disabled.</div>

    <div id="network-mode-banner" class="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-4 py-3 text-xs text-neutral-500">
      <span class="inline-flex h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true"></span>
      <strong id="network-mode-title" class="text-neutral-300">Network mode active</strong>
      <span id="network-mode-text">Anyone on this network can see the Available list below. Use a PIN for private content.</span>
      <span id="board-clock" class="ml-auto hidden font-medium text-neutral-400 sm:inline"></span>
    </div>

    <nav id="main-tabs" class="mb-6 flex flex-wrap gap-2 border-b border-white/10 pb-2" aria-label="Sections">
      <button type="button" data-tab="share" class="main-tab" aria-current="true">
        <span id="main-tab-share-text">Share</span>
      </button>
      <button type="button" data-tab="available" class="main-tab">
        <span id="main-tab-available-text">Available</span>
        <span id="main-tab-available-count" class="main-tab-count hidden">0</span>
      </button>
      <button type="button" data-tab="open-code" class="main-tab">
        <span id="main-tab-open-code-text">Open code</span>
      </button>
      <button type="button" data-tab="files" class="main-tab">
        <span id="main-tab-files-text">Files</span>
      </button>
    </nav>

    <section id="create-card" data-tab-panel="share" class="glass-panel app-shadow overflow-hidden rounded-2xl">
      <div class="flex items-center justify-between border-b border-white/[.07] px-5 py-5 sm:px-7">
        <div class="flex items-center gap-4">
          <span class="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300 ring-1 ring-inset ring-[var(--line)]">
            <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h6"/>
            </svg>
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
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <button
              id="create-submit"
              type="submit"
              class="primary-action inline-flex min-w-40 items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg data-button-icon viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
              <span data-button-label>Save note</span>
            </button>
          </div>
        </div>
      </form>
    </section>

    <p id="create-privacy-note" data-tab-panel="share" class="mt-3 text-xs leading-5 text-neutral-600">
      Only titles appear in the local list. Use a PIN for private content.
    </p>

      <article id="notes-section" data-tab-panel="available" class="glass-panel overflow-hidden rounded-2xl">
        <div class="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <h2 id="available-title" class="text-base font-semibold text-white">Available on this network</h2>
            <div class="mt-1 flex items-center gap-2 text-xs text-neutral-600">
              <span id="item-count">0 items</span>
              <span aria-hidden="true">·</span>
              <span id="last-refreshed">Loading</span>
            </div>
          </div>
          <button id="refresh-button" type="button" data-action="refresh-items" class="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Refresh local board">
            <svg data-refresh-icon viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2"/>
            </svg>
          </button>
        </div>

        <div class="notes-toolbar">
          <label class="sr-only" for="notes-search">Search notes</label>
          <input id="notes-search" class="notes-search" type="search" placeholder="Search available notes…" autocomplete="off">
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
            <button type="button" data-action="focus-create" class="mt-3 text-sm font-medium text-violet-400 transition hover:text-violet-300">Create the first one</button>
          </div>

          <div id="board-list" class="hidden grid-cols-1 gap-2"></div>
        </div>
      </article>

      <aside id="join-card" data-tab-panel="open-code" class="glass-panel h-fit rounded-2xl p-5 max-w-md">
        <h2 id="open-code-title" class="text-base font-semibold text-white">Open a code</h2>
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
            Open share
          </button>
        </form>
        <button id="scan-qr-text" type="button" data-action="open-scanner" class="mt-3 w-full rounded-md px-4 py-2.5 text-sm text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200">
          Scan QR instead
        </button>
      </aside>

    <section id="files-card" data-tab-panel="files" class="glass-panel app-shadow overflow-hidden rounded-2xl">
      <div class="flex items-center justify-between border-b border-white/[.07] px-5 py-5 sm:px-7">
        <div>
          <h2 id="files-section-title" class="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Share a file</h2>
          <p id="files-section-subtitle" class="mt-1 text-xs text-slate-500">Available for {duration} · deleted automatically</p>
        </div>
        <span id="files-temporary-badge" class="hidden rounded-full border border-cyan-400/15 bg-cyan-400/[.06] px-3 py-1 text-xs text-cyan-200/80 sm:inline">Temporary</span>
      </div>

      <form id="file-upload-form" class="px-5 py-6 sm:px-7" novalidate>
        <label id="files-drop-zone" for="file-input" class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 px-4 py-10 text-center transition hover:border-cyan-400/40">
          <svg viewBox="0 0 24 24" class="h-7 w-7 text-slate-500" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
          <span id="files-drop-hint" class="text-sm text-slate-400">Drag and drop a file here, or click to choose one.</span>
          <span id="file-input-name" class="text-xs text-slate-600"></span>
          <input id="file-input" name="file" type="file" multiple class="sr-only">
        </label>
        <div id="staged-files-list" class="mt-3 hidden grid gap-1 text-xs text-slate-400"></div>
        <p id="staged-files-total" class="mt-1 hidden text-xs text-slate-500"></p>

        <div class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-1 items-center gap-4">
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
          </div>
          <button id="file-upload-submit" type="submit" class="primary-action inline-flex min-w-40 items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50">
            <span data-button-label id="files-upload-button-text">Upload file</span>
          </button>
        </div>
      </form>

      <p id="files-privacy-note" class="px-5 pb-5 text-xs leading-5 text-neutral-600 sm:px-7">Only titles appear in the available list. Use a PIN for private files.</p>

      <div class="border-t border-white/5 px-5 py-5 sm:px-7">
        <div class="flex items-center justify-between gap-4">
          <h3 id="files-available-title" class="text-base font-semibold text-white">Files available on this network</h3>
          <button id="files-refresh-button" type="button" data-action="refresh-files" class="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Refresh files board">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2"/></svg>
          </button>
        </div>
        <div id="files-board-empty" class="hidden py-10 text-center">
          <p id="files-empty-text" class="text-sm text-neutral-500">No shared files yet.</p>
        </div>
        <div id="files-board-list" class="mt-3 hidden grid-cols-1 gap-2"></div>
      </div>
    </section>
  </main>

  <footer id="site-footer" class="site-footer">
    <div class="mx-auto max-w-6xl px-5 py-10 sm:px-7">
      <div class="footer-grid">
        <div>
          <a href="/" class="inline-flex items-center gap-3">
            <span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h4"/></svg></span>
            <strong class="site-wordmark text-lg">__APP_NAME__</strong>
          </a>
          <p id="footer-tagline" class="mt-4 max-w-sm text-sm leading-6 text-slate-500">Temporary text sharing, made simple.</p>
        </div>
        <div>
          <p id="footer-explore-title" class="footer-heading">Explore</p>
          <div class="footer-links">
            <button id="footer-create-text" type="button" data-action="focus-create">Create note</button>
            <button id="footer-available-text" type="button" data-action="focus-notes">Available notes</button>
            <button id="footer-open-code-text" type="button" data-action="focus-join">Open code</button>
          </div>
        </div>
        <div>
          <p id="footer-information-title" class="footer-heading">Information</p>
          <div class="footer-links">
            <button id="footer-guide-text" type="button" data-action="open-drawer-section" data-drawer-target="guide-drawer-section">How to use</button>
            <button id="footer-feedback-text" type="button" data-action="open-drawer-section" data-drawer-target="feedback-drawer-section">Feedback</button>
            <button id="footer-about-text" type="button" data-action="open-drawer-section" data-drawer-target="about-drawer-section">About</button>
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
  </footer>
  </div>

  <div id="drawer-backdrop" class="drawer-backdrop" data-action="close-drawer"></div>
  <aside id="side-drawer" class="side-drawer" aria-hidden="true" aria-label="AirText menu">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h4"/></svg></span>
        <strong>__APP_NAME__</strong>
      </div>
      <button type="button" data-action="close-drawer" class="icon-button" aria-label="Close menu"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>

    <nav class="mt-7 grid gap-2" aria-label="Menu">
      <button id="drawer-create-text" type="button" data-action="drawer-create" class="primary-action px-4 py-3 text-left font-semibold">Create a note →</button>
      <button id="drawer-open-code-text" type="button" data-action="drawer-join" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Open a share code</button>
      <button id="drawer-scan-text" type="button" data-action="open-scanner" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Scan a QR code</button>
    </nav>

    <section id="guide-drawer-section" class="drawer-section">
      <p id="guide-eyebrow" class="hero-kicker">How to use</p>
      <h2 id="guide-title" class="mt-2 text-2xl font-bold text-white">Share in four steps</h2>
      <div class="mt-4">
        <div class="guide-step"><span class="step-number">1</span><div><strong id="guide-step1-title">Create</strong><p id="guide-step1-text" class="mt-1 text-sm text-slate-500">Add a title and paste or type your note.</p></div></div>
        <div class="guide-step"><span class="step-number">2</span><div><strong id="guide-step2-title">Protect</strong><p id="guide-step2-text" class="mt-1 text-sm text-slate-500">Optionally add a PIN before saving.</p></div></div>
        <div class="guide-step"><span class="step-number">3</span><div><strong id="guide-step3-title">Share</strong><p id="guide-step3-text" class="mt-1 text-sm text-slate-500">Send the link, short code or QR.</p></div></div>
        <div class="guide-step"><span class="step-number">4</span><div><strong id="guide-step4-title">Receive</strong><p id="guide-step4-text" class="mt-1 text-sm text-slate-500">Opening it adds the note to that network until expiry.</p></div></div>
      </div>
    </section>

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

    <section id="about-drawer-section" class="drawer-section">
      <p id="about-eyebrow" class="hero-kicker">About</p>
      <h2 id="about-title" class="mt-2 text-2xl font-bold text-white">Simple sharing without an account</h2>
      <p id="about-text" class="mt-3 text-sm leading-6 text-slate-500">AirText is a lightweight way to move temporary text between nearby or remote devices.</p>
      <div class="developer-card">
        <span class="developer-avatar" aria-hidden="true">✦</span>
        <div>
          <strong id="developer-name">Farhan Ali</strong>
          <p id="developer-role" class="text-xs text-slate-500">Web Developer</p>
        </div>
      </div>
      <p id="developer-bio" class="mt-3 text-sm leading-6 text-slate-500">Building practical, privacy-conscious tools for the web.</p>
      <div id="drawer-social-links" class="social-links mt-4"></div>
      <div id="developer-contact-links" class="mt-4 flex flex-wrap gap-3 text-sm"></div>
    </section>

    <section id="qrtool-drawer-section" class="drawer-section">
      <p id="qrtool-eyebrow" class="hero-kicker">Utility</p>
      <h2 id="qrtool-title" class="mt-2 text-2xl font-bold text-white">QR code for any link</h2>
      <p id="qrtool-subtitle" class="mt-2 text-sm leading-6 text-slate-500">Paste a URL and get an instant QR code. Nothing is saved or sent to a server.</p>
      <form id="qrtool-form" class="mt-4 grid gap-3" novalidate>
        <label for="qrtool-input" class="sr-only">Link</label>
        <input id="qrtool-input" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com" class="form-field" required>
        <button id="qrtool-button-text" type="submit" class="primary-action px-4 py-3 font-semibold">Generate QR</button>
      </form>
      <div id="qrtool-output-wrap" class="mt-4 hidden text-center">
        <div id="qrtool-output" class="mx-auto grid place-items-center rounded-xl bg-white p-4" style="width:fit-content"></div>
        <button id="qrtool-download-text" type="button" data-action="download-qrtool" class="mt-3 rounded-md border border-[var(--line)] px-4 py-2 text-sm">Download PNG</button>
      </div>
    </section>

    <section class="drawer-section text-sm leading-6 text-slate-500">
      <p><strong class="text-white">Privacy:</strong> <span id="privacy-text">Notes and configuration use D1. Network addresses are hashed before use; raw IP addresses are not stored in analytics.</span></p>
      <a id="admin-link-text" href="/admin" class="mt-5 inline-block text-violet-400">Administrator panel →</a>
    </section>
  </aside>

  <section id="admin-app" class="admin-screen hidden-force">
    <header class="site-header sticky top-0 z-40 border-b">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-7">
        <a href="/" class="flex items-center gap-3"><span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h4"/></svg></span><span class="site-wordmark text-lg font-bold">AirText Admin</span></a>
        <div class="flex items-center gap-2">
          <button type="button" data-action="toggle-theme" class="icon-button" aria-label="Toggle theme"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2"/></svg></button>
          <button id="admin-logout" type="button" class="hidden rounded-md border border-[var(--line)] px-4 py-2 text-sm">Sign out</button>
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

      <div id="admin-dashboard" class="hidden">
        <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div><p class="hero-kicker">Control center</p><h1 class="mt-2 text-4xl font-bold text-white">Dashboard</h1><p id="admin-storage-status" class="mt-2 text-xs text-slate-500">D1 primary storage · 0 routine KV writes</p></div>
          <button id="admin-refresh" type="button" class="rounded-md border border-[var(--line)] px-4 py-2 text-sm">Refresh data</button>
        </div>

        <div class="admin-tabs" role="tablist">
          <button type="button" class="admin-tab active" data-admin-tab="overview" role="tab" aria-selected="true">Overview</button>
          <button type="button" class="admin-tab" data-admin-tab="notes" role="tab" aria-selected="false">Notes</button>
          <button type="button" class="admin-tab" data-admin-tab="files" role="tab" aria-selected="false">Files</button>
          <button type="button" class="admin-tab" data-admin-tab="feedback" role="tab" aria-selected="false">Feedback</button>
          <button type="button" class="admin-tab" data-admin-tab="users" role="tab" aria-selected="false">Users</button>
          <button type="button" class="admin-tab" data-admin-tab="settings" role="tab" aria-selected="false">Settings</button>
        </div>

        <div class="admin-tab-panel" data-admin-panel="overview">
          <div id="admin-stats" class="admin-stats"></div>
          <div class="admin-grid mt-5">
            <section class="admin-panel">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">Activity</h2><p class="text-xs text-slate-500">Last seven days</p></div></div>
              <div class="admin-panel-body"><div id="admin-chart" class="bar-chart"></div></div>
            </section>
            <section class="admin-panel">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">Feature totals</h2><p class="text-xs text-slate-500">Retained analytics events</p></div></div>
              <div id="admin-event-counts" class="admin-panel-body grid gap-3 text-sm"></div>
            </section>
          </div>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="notes">
          <section class="admin-panel"><div class="admin-panel-head"><div><h2 class="font-bold text-white">Active notes</h2><p class="text-xs text-slate-500">Metadata only; note text remains private.</p></div></div><div id="admin-notes" class="admin-panel-body"></div></section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="files">
          <section class="admin-panel">
            <div class="admin-panel-head"><div><h2 class="font-bold text-white">Storage usage</h2><p class="text-xs text-slate-500">Site-wide R2 storage against the configured cap.</p></div></div>
            <div class="admin-panel-body">
              <div id="admin-storage-bar" class="storage-bar"><div id="admin-storage-fill" class="storage-bar-fill"></div></div>
              <p id="admin-storage-label" class="mt-2 text-xs text-slate-500">—</p>
              <p id="admin-storage-warning" class="mt-2 text-xs text-amber-400 hidden"></p>
            </div>
          </section>
          <section class="admin-panel mt-5"><div class="admin-panel-head"><div><h2 class="font-bold text-white">Active files</h2><p class="text-xs text-slate-500">Metadata only; file contents remain private.</p></div></div><div id="admin-files" class="admin-panel-body"></div></section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="feedback">
          <section class="admin-panel"><div class="admin-panel-head"><div><h2 class="font-bold text-white">User feedback</h2><p class="text-xs text-slate-500">Review and resolve submissions.</p></div></div><div id="admin-feedback" class="admin-panel-body"></div></section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="users">
          <section class="admin-panel">
            <div class="admin-panel-head">
              <div><h2 class="font-bold text-white">Accounts</h2><p class="text-xs text-slate-500">Only admins can create accounts -- no public signup.</p></div>
            </div>
            <div id="admin-users" class="admin-panel-body"></div>
          </section>

          <section class="admin-panel mt-5">
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
            <div class="admin-panel-head"><div><h2 class="font-bold text-white">Roles &amp; default limits</h2><p class="text-xs text-slate-500">Rename a role or edit what Contributor/Pro accounts get by default. Admin limits are fixed.</p></div></div>
            <div id="admin-roles" class="admin-panel-body grid gap-4"></div>
          </section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="settings">
        <section class="admin-panel">
          <div class="admin-panel-head"><div><h2 class="font-bold text-white">Site settings and limits</h2><p class="text-xs text-slate-500">Changes apply without redeploying.</p></div></div>
          <form id="admin-settings-form" class="admin-panel-body">
            <div class="settings-grid">
              <label class="grid gap-2 text-sm">Site name<input id="setting-app-name" class="form-field" maxlength="40"></label>
              <label class="grid gap-2 text-sm">Tagline<input id="setting-tagline" class="form-field" maxlength="100"></label>
              <label class="grid gap-2 text-sm sm:col-span-2">Announcement message<input id="setting-announcement" class="form-field" maxlength="1000"></label>
              <label class="grid gap-2 text-sm">Expiry in minutes<input id="setting-ttl" class="form-field" type="number" min="5" max="1440"></label>
              <label class="grid gap-2 text-sm">Notes per network<input id="setting-max-items" class="form-field" type="number" min="10" max="100"></label>
              <label class="grid gap-2 text-sm">Title length<input id="setting-title-length" class="form-field" type="number" min="20" max="120"></label>
              <label class="grid gap-2 text-sm">Text length<input id="setting-text-length" class="form-field" type="number" min="500" max="20000"></label>
              <label class="grid gap-2 text-sm">Create cooldown (seconds)<input id="setting-create-cooldown" class="form-field" type="number" min="1" max="60"></label>
              <label class="grid gap-2 text-sm">Unlock cooldown (seconds)<input id="setting-unlock-cooldown" class="form-field" type="number" min="1" max="30"></label>
              <label class="grid gap-2 text-sm">Default theme<select id="setting-default-theme" class="form-field"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
            </div>
            <details class="admin-content-editor mt-5" open>
              <summary>Public content editor</summary>
              <p class="mt-2 text-xs text-slate-500">Edit every public label, heading, description, developer detail, footer line, social URL, file-sharing limit, QR tool label and SEO field.</p>
              <div id="admin-content-fields" class="mt-5 grid gap-5"></div>
            </details>
            <div class="mt-5 grid gap-x-8 md:grid-cols-2">
              <label class="setting-toggle"><span>Allow new notes</span><input id="setting-notes-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>PIN protection</span><input id="setting-pin-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Cross-network auto-add</span><input id="setting-cross-network" type="checkbox"></label>
              <label class="setting-toggle"><span>Feedback form</span><input id="setting-feedback-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Privacy-safe analytics</span><input id="setting-analytics-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Hero section</span><input id="setting-hero-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Hero right panel</span><input id="setting-hero-panel-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Announcement line</span><input id="setting-announcement-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Feature ticker</span><input id="setting-ticker-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Create section</span><input id="setting-create-section-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Available notes section</span><input id="setting-available-section-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Open-code section</span><input id="setting-open-code-section-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>How-to guide</span><input id="setting-guide-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>About section</span><input id="setting-about-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Footer</span><input id="setting-footer-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Social links</span><input id="setting-social-links-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Show copyright year</span><input id="setting-footer-show-year" type="checkbox"></label>
              <label class="setting-toggle"><span>Show developer credit</span><input id="setting-footer-show-developer" type="checkbox"></label>
            </div>
            <div class="danger-zone mt-6">
              <p class="text-xs font-bold uppercase tracking-wider text-red-300">Danger zone</p>
              <label class="setting-toggle"><span>Maintenance mode (pauses new notes and files site-wide)</span><input id="setting-maintenance" type="checkbox"></label>
            </div>
            <button id="admin-settings-submit" type="submit" class="primary-action mt-5 px-5 py-3 font-semibold">Save settings</button>
          </form>
        </section>
        </div>
      </div>
    </div>
  </section>

  <div id="maintenance-modal" class="maintenance-modal hidden-force" role="dialog" aria-modal="true" aria-labelledby="maintenance-title">
    <div class="maintenance-card">
      <span class="maintenance-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v5M12 16v5M4.2 7.5l4.3 2.5M15.5 14l4.3 2.5M4.2 16.5 8.5 14M15.5 10l4.3-2.5"/><circle cx="12" cy="12" r="3"/></svg>
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
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
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
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
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
            <button id="delete-file-button" type="button" data-action="delete-current-file" class="hidden flex-1 items-center justify-center rounded-md border border-red-500/20 px-4 py-3 text-sm text-red-300 transition hover:bg-red-500/10">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- QR modal -->
  <div id="qr-modal" class="fixed inset-0 z-[60] hidden items-end justify-center bg-[#02040a]/85 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div class="glass-panel slide-up w-full max-w-sm p-5 shadow-2xl sm:rounded-2xl">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-white">Share code</h2>
        <button type="button" data-action="close-qr-modal" class="grid h-9 w-9 place-items-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
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

      <button type="button" data-action="copy-code" class="mt-3 w-full rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Copy code</button>
    </div>
  </div>

  <!-- Scanner modal -->
  <div id="scanner-modal" class="fixed inset-0 z-[70] hidden items-end justify-center bg-[#02040a]/85 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div class="glass-panel slide-up w-full max-w-lg p-5 shadow-2xl sm:rounded-2xl">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-white">Scan QR</h2>
        <button type="button" data-action="close-scanner" class="grid h-9 w-9 place-items-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-white" aria-label="Close scanner">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div id="qr-reader" class="mt-5 min-h-64 bg-[#1b1b1b]"></div>
      <p id="scanner-status" class="mt-4 text-center text-sm text-neutral-500">Starting camera…</p>
    </div>
  </div>

  <div id="toast-container" class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"></div>

  
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
  minPinLength: number;
  maxPinLength: number;
  canonicalPath: string;
  requestOrigin: string;
}

export function renderPage(settings: SiteSettings, options: RenderPageOptions): string {
  const bootData = {
    ...settings,
    initialShareCode: options.initialShareCode,
    initialFileShareCode: options.initialFileShareCode,
    initialShareVia: options.initialShareVia,
    initialAdmin: options.initialAdmin,
    minPinLength: options.minPinLength,
    maxPinLength: options.maxPinLength,
  };

  const replacements: Record<string, string> = {
    "__APP_NAME__": escapeHtml(settings.appName),
    "__SEO_TITLE__": escapeHtml(settings.seoSiteTitle || `${settings.appName} — ${settings.tagline}`),
    "__SEO_META_DESCRIPTION__": escapeHtml(settings.seoMetaDescription || settings.tagline || ""),
    "__SEO_EXTRA_HEAD__": buildSeoHeadExtras(settings, options),
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

/** Ported verbatim from airtext-worker-modern.js:2605-2649. */
function buildSeoHeadExtras(settings: SiteSettings, options: RenderPageOptions): string {
  if (!settings.seoEnabled) return "";
  const origin = String(settings.seoCanonicalBaseUrl || options.requestOrigin || "").replace(/\/$/, "");
  const canonicalPath = !options.canonicalPath || options.canonicalPath === "/" ? "" : options.canonicalPath;
  const canonicalUrl = origin ? `${origin}${canonicalPath}` : "";
  const ogImage = String(settings.seoOgImageUrl || "");
  const title = settings.seoSiteTitle || settings.appName;
  const description = settings.seoMetaDescription || settings.tagline || "";

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

  return parts.join("\n  ");
}
