# AirText V3 — Complete Plan

Successor to the V2 build documented in `CLAUDE.md`. V3 is a **presentation + information-architecture rewrite**, not a rewrite of the data layer. The D1 schema, crypto model, auth model, limits engine and route handlers for create/open/unlock/delete stay as they are; what changes is how the app is *routed*, *worded*, *rendered* and *administered*.

**Non-negotiable constraints for every phase**

- `/s/:code` and `/f/:code` keep working, byte-for-byte. Printed and screenshotted QR codes exist in the wild.
- Two login endpoints stay separate (`/api/admin/login` rank-0-only, `/api/auth/login` any rank). V3 unifies the *front door*, not the backends.
- `x-airtext-admin` header stays required on every admin mutation.
- Raw SQL in route handlers; Drizzle schema mirrors migrations for tooling only.
- Every phase ends green: `npx tsc --noEmit` + `npx vitest run`.
- No deploy without: backup → local verify → deploy → smoke-check live URL.

---

## 0. Decisions locked before any code

### 0.1 Vocabulary

The product noun becomes **Drop**. One word for text *and* files — this is what collapses the two parallel universes the app has today.

| Old (technical) | New (V3) |
|---|---|
| Note / file share | **Drop** |
| Available on this network | **Nearby** |
| Network | **Wi-Fi** |
| Open code | **Receive** |
| Burn after reading | **Open once** |
| Custom / vanity code | **Choose your own link** |
| Expires in / TTL | **Disappears in** |
| PIN | PIN (kept), toggle labelled **"Lock it"** |
| My shares | **My Drops** |

Copy rules: second person ("your Wi-Fi", "your drops"), no jargon in any user-facing string, every destructive or irreversible option gets a one-line plain-English explainer beneath it.

### 0.2 Roles

Current ordering is backwards to users (rank 1 "Contributor" outranks rank 2 "Pro"). Renamed via `roles.name` — data change, no code change:

| Rank | Old name | New name |
|---|---|---|
| 0 | Admin | **Admin** |
| 1 | Contributor | **Pro** |
| 2 | Pro | **Member** |
| — | (no row) | Anonymous |

### 0.3 Rendering model

Move from *one HTML shell containing three apps toggled with `.hidden-force`* to **real server-rendered routes sharing one shell**. Each route renders only its own section and gets its own `<title>`, meta description and canonical URL.

Rationale: the site currently has exactly one indexable page. V3 ends with 12+. In-page tab switching survives *within* a page; there is no client-side history router.

---

## 1. Route map

```
/                 Landing page (marketing + working quick-share above the fold)
/text             Send text
/files            Send files
/nearby           What's on this Wi-Fi — Text section + Files section
/receive          Enter a code / scan QR
/qr               Free QR code generator            (standalone SEO page)
/guide            How it works                      (SEO)
/faq              FAQ accordion                     (SEO + FAQPage schema)
/about
/privacy          NEW — required, user data is stored
/terms            NEW
/login            One front door for all accounts
/account          My Drops + plan + settings
/admin            Admin panel (sidebar IA)
/s/:code          UNCHANGED
/f/:code          UNCHANGED
```

**Desktop header:** `Logo | Send ▾ (Text · Files) | Nearby | Receive | Tools ▾ (QR generator) | Help ▾ (Guide · FAQ · About) | 🌓 | [Sign in] or [avatar ▾]`

**Mobile:** bottom tab bar — `Send · Nearby · Receive · Menu`, plus a dedicated QR-scan icon button in the header. Today `@media (max-width:900px)` in `style.css:227` `display:none`s the entire desktop nav, leaving every action two taps deep in a drawer. This is the single largest mobile usability win in V3.

---

## 2. Settings cut — ~150 keys → ~60

The root cause of the unusable admin: `client/main.js:2688` renders **~130 fields** in one accordion, on top of 10 grid inputs and 19 toggles — ~160 controls behind a single Save button.

### Tier 1 — Operational (~27 keys). Stays in admin → "Limits & Features"

`ttlSeconds` `maxTitleLength` `maxTextLength` `maxLocalItems` `createCooldownSeconds` `unlockCooldownSeconds` `pinEnabled` `notesEnabled` `analyticsEnabled` `crossNetworkAddEnabled` `maintenanceMode` `defaultTheme` `fileSharingEnabled` `maxFileSizeMB` `maxTotalStorageMB` `maxBatchTotalMB` `maxFilesPerBatch` `fileTtlSeconds` `fileUploadCooldownSeconds` `maxActiveFiles` `allowedFileExtensions` `blockedFileExtensions` `qrLinkToolEnabled` `feedbackEnabled` `announcementEnabled` `announcement` `announcementLabel`

### Tier 2 — Brand & marketing (~33 keys). Stays in admin → "Content", with live preview

`appName` `tagline` `heroTitlePrimary` `heroTitleOutline` `heroDescription` `heroPrimaryButtonText` `heroSecondaryButtonText` `footerTagline` `aboutTitle` `aboutText` `developerName` `developerRole` `developerBio` `developerWebsite` `developerEmail` `socialFacebook` `socialInstagram` `socialX` `socialLinkedIn` `socialGitHub` `socialYouTube` `maintenanceTitle` `maintenanceMessage` + the 9 `seo*` keys

### Tier 3 — DELETED from settings, moved to `client/copy.js` (~90 keys)

All `header*Text` · all `drawer*Text` · `heroEyebrow` · all `heroPanel*` (eyebrow, title, text, steps 1–3, stats 1–2) · `tickerItem1–4` · `createSectionTitle/Subtitle/TitlePlaceholder/TextPlaceholder/ButtonText/TemporaryBadge/PrivacyNote` · `pinToggleText` · `availableTitle/SearchPlaceholder/EmptyText` · `openCodeTitle/Placeholder/ButtonText` · `scanQrText` · all `guide*` · all `feedback*` labels/placeholders · `aboutEyebrow` · `privacyText` · `adminLinkText` · all `footer*` link labels + headings + `footerRightsText` + `footerDeveloperPrefix` · all `files*` labels/hints/badges · all `qrLinkTool*` labels · `maintenanceEyebrow` `maintenanceButtonText`

### Also deleted — the 12 section-visibility toggles

`heroEnabled` `heroPanelEnabled` `tickerEnabled` `createSectionEnabled` `availableSectionEnabled` `openCodeSectionEnabled` `guideEnabled` `aboutEnabled` `footerEnabled` `socialLinksEnabled` `footerShowYear` `footerShowDeveloper`

Once each section owns a route, "hide the open-code section" is meaningless. Social links hide automatically when their URL is blank.

**Migration safety:** zero-risk. `sanitizeSettings()` (`settings.ts:198`) iterates `Object.entries(DEFAULT_SETTINGS)`; removing a key means the stored value is ignored, no crash, no migration. The one required task is a **full sweep of `src/html.ts` and `client/main.js` for every removed key** so no label renders blank — enforce with a typecheck-time constant map, not by eye.

---

## 3. Design system

### 3.1 Tokens

Keep `#c9f31d` lime as the brand accent (it's distinctive). Add a **tier palette** so gold/violet never collide with it. Delete the `!important` override block at `style.css:100–108` — it currently drags Tailwind's violet/slate classes back to the tokens and will actively fight the tier gradients. Markup uses semantic tokens directly.

### 3.2 Icon sprite

Today every icon is inline `<path>` data, repeated (the logo appears 5 separate times in `html.ts`). V3 renders **one `<symbol>` sheet** in the shell; everything else is `<svg><use href="#i-file">`. CSP-safe, no library, no duplication. ~25 icons, Lucide path data (ISC). Adds file-type icons (pdf / image / zip / video / doc / audio) derived from extension.

### 3.3 Tier visual system

| Tier | Avatar ring | Badge | Card treatment |
|---|---|---|---|
| **Admin** (0) | Gold gradient ring + verified check | `👑 Admin`, gold gradient chip | Gradient border + soft glow + faint shimmer |
| **Pro** (1) | Accent/violet gradient ring | `★ Pro`, gradient chip | Accent-tinted left edge |
| **Member** (2) | Solid accent ring | `● Member`, solid chip | Subtle tinted background |
| Anonymous | none | none | Plain row (as today) |

Two rules that keep this from backfiring:

1. **Only Admin gets the loud card.** Ring + chip is always-on for logged-in tiers; the gradient border is the Admin-only reward. Every row having a gradient border kills scanability and makes nothing special.
2. **One shared render function** with a `tier` param. Notes and files render through separate code paths today — without unification the tier styling drifts within a month.

Implemented as CSS custom properties (`--tier-admin-ring`, `--tier-pro-ring`, …) so future tiers are a token addition. Shimmer respects `prefers-reduced-motion`.

### 3.4 Badges

`.note-badge` (`style.css:169`) is a 9px uppercase grey pill — unreadable and semantically empty. V3: 10–11px, icon + label, colour-coded by meaning — 🔒 Locked (amber) · 🔥 Open once (red) · Mine (accent) · Received (neutral) · file-type chip.

### 3.5 Avatars

Deterministic gradient from a hash of `user.id`, initials on top. No R2 storage, no upload validation, no moderation. Real uploads can come later if ever justified.

---

## 4. Landing page (`/`)

1. Sticky nav
2. **Hero** — headline + subhead + two CTAs (`Share text` / `Share files`) + trust line *"No account · Auto-deletes · Free"*
3. **Working quick-share card, in the hero** — compact `Text | Files` tabbed card that creates the drop without leaving the page, plus a "Have a code?" field. Value in five seconds beats a beautiful hero.
4. **"Share anything"** — three cards (Text & notes · Files & photos · Links). This is where the text→files expansion is stated in a headline, not left to a tab label.
5. **How it works** — 3 steps (Create → Send code/link/QR → Open anywhere) with a Text/Files toggle.
6. **Why AirText** — 4 blocks: Auto-deletes · PIN-locked · Any device · No signup.
7. **Live strip** — "N drops active on your Wi-Fi right now". Real data, already available.
8. **Device use-case grid** — Phone→Laptop, iPhone→Windows, Android→Mac. Each becomes a future SEO landing page.
9. **FAQ accordion**
10. **Final CTA**
11. **Footer**

**Removed from the current home:** the marquee ticker (`style.css:139` — dated, fights the eye) and the announcement bar in its current styling (feature kept, restyled as a dismissible thin strip).

---

## 5. Footer

Five blocks: **Product** (Share text, Share files, Nearby, Receive) · **Tools** (QR generator) · **Learn** (How it works, FAQ, About) · **Legal** (Privacy, Terms) · **Connect** (socials). Bottom bar: theme toggle, copyright, developer credit.

`/privacy` and `/terms` are new and required — the app stores accounts, hashed IPs and uploaded files with neither document today.

---

## 6. Auth & account

- **`/login` split from `/account`.** Today `/account` is a login form that becomes a dashboard — impossible to link to or redirect cleanly.
- One front door: `/login` posts to `/api/auth/login` for everyone. If the session returns `rank === 0`, show an "Open admin panel" link. Both backend endpoints stay separate as designed.
- **Signed-in header:** avatar + display name + tier badge → dropdown: *My Drops · Account settings · Admin panel (rank 0 only) · Sign out*.
- **`/account` → "My Drops":** cards not bare rows, inline copy-link + QR per drop, storage-used meter, and plan limits rendered in human language ("Files up to 50 MB", "Links last 7 days") instead of the current raw `EffectiveLimits` key dump.
- Account-request form gets real expectation-setting, not a grey paragraph.

---

## 7. Admin revamp

### 7.1 Layout — sidebar, not tabs

```
┌────────────┬──────────────────────────────────────────┐
│ AirText    │  [search]      View site   🌓  [avatar ▾]│
│ ADMIN      ├──────────────────────────────────────────┤
│ ▸ Overview │                                          │
│ ▸ Drops    │   page content                           │
│ ▸ Users    │                                          │
│ ▸ Inbox  ③ │                                          │
│ ▸ Analytics│                                          │
│ ▸ Settings │                                          │
│ ─────────  │                                          │
│ D1 ● R2 ●  │                                          │
└────────────┴──────────────────────────────────────────┘
```

Sidebar badge counts (unread feedback, pending account requests) tell the admin where to go without clicking.

### 7.2 Overview — operational, not vanity

Today's stats (`admin.ts:180`) are raw totals with nothing to compare against.

- **4 KPI cards with 7-day trend deltas + sparklines** — "142 drops ▲ 18% vs last week". `analytics.date` already exists; this is a query change.
- **"Needs attention" panel** — new feedback, pending account requests, storage >80%, failed-login spikes.
- **Storage meter** promoted from the Files tab.
- **Activity chart** upgraded from CSS bar-chart divs (`style.css:218`) to an area chart with a 7/30/90-day picker.
- **Recent activity feed** — last 20 meaningful events.
- **System health strip** — D1 / R2 / KV status (`filesBucketConfigured` already computed).

### 7.3 Drops (merges Notes + Files)

Two tabs today only because they were built in different phases.

- One table, `Type` column, search by code or title
- Filters: locked · open-once · owner tier · expiring soon · size. Sortable.
- **Server-side pagination** — replaces the hardcoded `LIMIT 100` with no offset
- **Bulk select → bulk delete**
- Row → detail drawer: metadata, owner + tier badge, network hash, download counts, live expiry countdown, delete
- **Content stays invisible to admins**, stated explicitly in the UI: *"Metadata only. Drop contents are never visible to admins."* That's a trust feature, not a limitation.

### 7.4 Users — kill the JSON footgun

Per-user `custom_limits` and `roles.default_limits` are edited as **raw JSON in a textarea** today. One malformed brace silently breaks a user's limits with no validation feedback.

- **Replace both with a real form** — one input per `EffectiveLimits` field, each with an "inherit from role" checkbox. JSON is written server-side.
- **Show computed effective limits** alongside, so the role→custom merge (`limits.ts:63`) stops being invisible.
- Search, filter by role/status, sort by last login.
- User detail page: profile · effective limits (inherited vs overridden marked) · their active drops · recent activity · actions (reset password, disable, delete).
- Tier badges reused from the public site — one visual language across both.

### 7.5 Inbox (was Feedback)

- **Account requests get their own tab.** They arrive as `category: "account_request"` mixed into bug reports today — one is a support ticket, the other is a signup queue.
- **Approve** on a request → opens the create-user form prefilled with name + email, closing a loop that's manual copy-paste today.
- Status filters with counts, bulk actions, CSV export.

### 7.6 Settings page

Sub-navigation instead of one scroll: **General** · **Limits & Plans** · **Features** · **Content** (Tier-2 copy, live preview) · **SEO** · **Danger zone** (maintenance mode, isolated).

- **Per-section save with a partial `PATCH`.** The endpoint already merges against `current` (`admin.ts:207`); it's the client that sends the whole object. Fixes silent last-write-wins between two admins.
- **Diff-before-save** on destructive changes (enabling maintenance mode, reducing a limit below current usage).
- Inline validation from the real `NUMERIC_RANGES` bounds (`settings.ts:217`) — today those clamp silently server-side.
- "Unsaved changes" navigation guard.

### 7.7 New admin capabilities

1. **Audit log** (new table) — who changed what, when, before/after. Today a settings change records one contentless `settings_updated` event (`admin.ts:218`). This is the difference between a hobby panel and a professional one.
2. **Security view** — recent admin logins, failed attempts by IP hash, active sessions with revoke.
3. **Storage breakdown** — by file type, by user, largest drops.
4. **CSV export** — users, feedback, analytics.
5. **Scheduled announcements** — start/end dates instead of manual on/off.
6. **"View limits as user X"** — read-only preview of someone's effective limits. Deliberately *not* true impersonation: 90% of the debugging value, none of the security surface.

### 7.8 Admin API changes

Split `/api/admin/dashboard` — which today batches 8 queries and ships 100 notes + 100 feedback + 100 file groups + all analytics on *every* refresh, even on Overview — into:

```
GET /api/admin/overview                       stats, trends, health, attention queue
GET /api/admin/drops?page&q&type&filter&sort  paginated, unified notes+files
GET /api/admin/feedback?page&status&category  paginated
GET /api/admin/users?page&q&role&status       paginated
GET /api/admin/audit?page&actor&action        new
POST /api/admin/drops/bulk-delete             new
PATCH /api/admin/settings                     now accepts partials, returns changed keys
```

All keep `requireRole(request, env, 0)` and the `x-airtext-admin` header on mutations.

---

## 8. Database changes

One new migration, `migrations/0003_v3.sql`:

- `audit_log` — `id, actor_user_id, actor_email, action, target_type, target_id, before_json, after_json, ip_hash, created_at`
- Indexes for the new paginated/searchable admin queries: `notes(expires_at, created_at)`, `file_groups(expires_at, created_at)`, `feedback(status, created_at)`, `users(role_id, status)`, `audit_log(created_at)`
- No column changes to `notes`, `files`, `file_groups`, `users` or `roles`.

Mirror in `src/db/schema.ts`. Export a fresh D1 backup (`wrangler d1 export airtext --remote`) before applying to production.

---

## 9. Feature additions

**Ship in V3 (high value, low effort)**
- Live "N active on your Wi-Fi" counter on the landing page
- localStorage "your recent drops" so anonymous users can find their own content again
- Web Share API sheet on mobile (~20 lines, the natural share action on a phone)
- Paste anywhere (`Ctrl+V`) → opens the composer prefilled
- Drag a file anywhere on the page → upload
- Expiry chooser (10 min / 1 hr / 1 day) within the user's limits — TTL is fixed today
- FAQ page + `FAQPage` schema (JSON-LD already emitted in `buildSeoHeadExtras`)
- File-type icons; image/PDF thumbnails in the open modal

**Ship in V3 (medium effort)**
- PWA manifest + install prompt
- QR generator as its own indexable page (buried in a drawer today)
- First-visit 3-step coach marks

**Planned, post-V3**
- Turnstile on create/upload/feedback (use the `turnstile-spin` skill)
- Device-pair SEO landing pages ("iPhone to Windows")
- Blog

---

## 10. Phases

Each phase is one commit, typechecked and tested, deployable on its own.

| # | Phase | Scope |
|---|---|---|
| **1** | **Vocabulary + settings cut** | Role renames (data). `client/copy.js` constants module. Delete ~102 keys from `DEFAULT_SETTINGS`. Sweep `html.ts` + `main.js` for stale references. Rebuild the admin content editor against the ~60 surviving keys. **Do this first — it unblocks everything and stops V3 copy from being added to a 130-field form.** |
| **2** | **Foundations** | Design tokens, remove the `!important` override block, icon sprite, tier CSS system, badge redesign, avatar generator. Split `src/html.ts` into per-page template functions and `client/main.js` into modules. |
| **3** | **Routing** | Real server-rendered routes with per-page SEO/canonical. Shared header + footer + modals. `/s/:code` `/f/:code` preserved. New nav (desktop dropdowns + mobile bottom bar). |
| **4** | **Landing page** | All 11 sections incl. the working in-hero quick-share and the live Wi-Fi counter. |
| **5** | **Feature pages** | `/text`, `/files`, `/nearby` (Text + Files sections), `/receive`, `/qr`, `/guide`, `/faq`, `/about`. Unified drop-card render function. |
| **6** | **Auth & account** | `/login` front door, avatar nav dropdown, `/account` → My Drops, tier system applied everywhere. |
| **7** | **Footer, legal, polish** | Footer rebuild, `/privacy`, `/terms`, PWA manifest, paste/drag shortcuts, Web Share, expiry chooser, coach marks. |
| **8** | **Admin revamp** | Migration 0003. Sidebar IA. Overview with trends. Drops (merged, paginated, bulk). Users with the limits form. Inbox with account requests. Settings sub-nav with partial PATCH. Audit log. Security view. |

---

## 11. Testing

Current baseline: 60 tests across 9 files, real Workers runtime via `@cloudflare/vitest-pool-workers`.

- **Per new HTML route:** 200 status + correct boot flag + correct canonical/title.
- **Phase 1:** assert every key referenced by templates exists in `DEFAULT_SETTINGS` (catches the sweep misses mechanically).
- **Phase 8:** the `/api/admin/dashboard` split **will break existing admin tests** — budget for rewriting them, plus new tests per paginated route (pagination bounds, search, filter, auth rejection, missing `x-airtext-admin`).
- Login-flow tests keep the ~3.1s inter-attempt delay pattern from `test/me.test.ts` to clear the rate limiter.
- Partial-settings PATCH needs a test proving unlisted keys are preserved.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Removed settings keys leave blank labels | Constant map + a test asserting template↔settings key parity (Phase 1) |
| Old QR codes break | `/s/:code` `/f/:code` untouched; explicit smoke test each phase |
| Admin dashboard split breaks tests | Expected; rewrite budgeted in Phase 8 |
| Settings last-write-wins between admins | Fixed by the partial PATCH in Phase 8 |
| `main.js` module split introduces regressions | Phase 2 is behaviour-neutral by design — no feature work lands in the same commit |
| Scope inflation (public rewrite + admin rewrite) | Admin is sequenced last; only the settings cut moves forward to Phase 1 |
| Tier gradients fight the `!important` block | Block removed in Phase 2, before tiers are applied in Phase 6 |
| Production D1 change | Backup before migration 0003; it is additive only |

---

## 13. Definition of done

- 12+ indexable routes, each with its own title/description/canonical
- Mobile: every primary action reachable in one tap from the bottom bar
- Admin settings: ~60 fields across 6 sub-pages, per-section save, no raw JSON anywhere
- Admin has an audit log answering "who changed this and when"
- Admin, Pro and Member drops are visually distinguishable at a glance from anonymous ones
- Zero technical vocabulary in any user-facing string
- `npx tsc --noEmit` clean, full vitest suite green, live smoke-check passed
