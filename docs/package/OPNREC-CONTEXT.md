# OPNREC-CONTEXT.md — OpenCode Persistent Context (Memory)

**Purpose:** This is my (OpenCode, lead architect) persistent memory. If a session ends, is interrupted, or flow changes, a NEW session of me MUST read this file FIRST to instantly regain full context and continue seamlessly. Update this file whenever you complete a milestone or change a decision.

## Project
VandeCRM — migrating `D:\VandeAgencyCRM` (Express + EJS) → React SPA (`D:\vandecrmreact`). Pixel parity. EJS stays during migration.

**Key facts:**
- Backend is **CommonJS `.js`** (matching the copied original code). NOT TypeScript.
- Entry point: `server/src/server.js`. Run with `npm run dev:server` (nodemon) or `node server/src/server.js`.
- Client: Vite + React 18 + TS at `client/`. Runs on port 5173, proxies `/api` → `:5000`.
- Node pinned to **20** (`.nvmrc`, `engines`) — machine currently runs 26; Codex++ target 20.
- MongoDB running locally (default `mongodb://127.0.0.1:27017/vande-agency-crm`).

## The 3 Developers & My Role
I am the **lead architect/guide**. I do NOT implement feature pages — I build shared infrastructure + auth + routing, then guide via docs/prompts so I don't burn tokens and Codex/Antigravity stay self-sufficient.

| Developer | Owns | Status |
|---|---|---|
| **OpenCode (me)** | Auth, JWT middleware, server entry/boot, shared `api/client.ts` + `types`, backend copy, route registration, coordination docs + **former-Codex Dashboard & Customers/Leads** | Active |
| ~~Codex~~ | ~~Dashboard + Customers~~ | **Departed 2026-09-04** — domains split: OpenCode (Dashboard+Customers), Antigravity (Clients) |
| **Antigravity** | The other 11 domains + **Clients (won-customer sub-view)** | Active |

## What I Have DONE (in this effort)
1. ✅ Init git repo `D:\vandecrmreact` (was NOT a repo).
2. ✅ Copied shared backend from `D:\VandeAgencyCRM\src` → `server/src/{models,services,utils,config,middleware,routes}` (78 files).
3. ✅ Created boot stubs for `server/src/api/dashboard.js` and `customers.js` (Codex later replaced dashboard.js with real impl).
4. ✅ Built `server/src/api/auth.js` + `server/src/api/middleware/auth.js` (JWT: `requireApiAuth`, `requireApiPermission`, `generateToken`).
5. ✅ Created server entry `server/src/server.js` (CommonJS), REMOVED the old `server.ts` (it failed strict TS compile — Codex finding).
6. ✅ Updated `package.json` scripts: `dev:server` → `node server/src/server.js`; removed root `server.js` (leftover from original layout).
7. ✅ Fixed client TS junction: added `CustomerInput` type, updated `customersApi.create/update` signatures, typed form state correctly, removed `as any` — client typechecks green.
8. ✅ Created placeholder `client/src/pages/dashboard/DashboardPage.tsx` (Codex owns real impl).
9. ✅ Each API route self-guards with JWT; removed broken EJS session/permission guards from `server.js` API mounts (Codex finding: must auth bearer before applying permissions).
10. ✅ Node 20 pinning: `.nvmrc` = `20`, `engines.node = "20.x"`.
11. ✅ `.gitignore` (excludes node_modules, dist, .env, logs).
12. ✅ Created coordination package: `docs/package/SYNC.md`, `docs/package/OWNERSHIP.md`, this `OPNREC-CONTEXT.md`.
13. ✅ **STYLING FOUNDATION (the big parity gap):**
    - Copied the original design system into the React client: `client/src/styles/{app,auth,lead-detail,search}.css` (from `D:\VandeAgencyCRM\public\css\`). `app.css` = 354KB gold/teal theme (Inter + Plus Jakarta Sans).
    - Rewrote `client/src/index.css`: imports the real system + thin React glue ONLY (dropdowns, bell, stat cards, form cards, `.btn-primary/secondary/danger` aliased to theme vars). Removed the generic blue/gray overrides that conflicted with the design system.
    - Wired org theme into `AuthContext` (`applyTheme`): sets CSS vars (`--gold/--teal/--bg/--panel/--text` + derived `--bg-soft/--border/--muted/--sub/--hover/--accent-text`) and `data-theme`/`dark-theme` on `<html>` from `user.organization.theme` (defaults applied on mount).
    - Added `theme?: OrganizationTheme` to `User` type in `client/src/api/auth.ts` (returned by `/auth/me`).
    - Verified: `npx tsc --noEmit` exit 0 + `npx vite build` green (335KB CSS bundle).
    - **Added parity rule to `docs/REACT-PATTERNS.md`:** all pages must use ORIGINAL EJS class names (`page-head`, `dashboard-head`, `btn`, `leads-table-top-bar`, etc.) — NOT invented `.page-header`/`.stats-bar`/`.form-card`. Open the matching EJS view and mirror its exact class names.

## What Codex Has DONE (verified)
- Dashboard API `server/src/api/dashboard.js` — FULL implementation (workspace-scoped, permissions, preferences, pipeline move). COMMITTED `cc9e0e6`.
- Dashboard React page — full metrics/weeks/deadlines/drag-drop pipeline. COMMITTED.
- Customers API — core list/detail/create/update/delete/bulk + CSV import/export/import-preview endpoints (server-side). COMMITTED `f85222f`, `829f694`, `02cb561`. NOTE: CSV *client* UI (buttons/preview modal) NOT yet built — that's Codex's remaining work.
- Customer Detail rebuilt with original lead-detail tabs (overview/activity/related/folders/custom fields) + editing. COMMITTED.

## What Antigravity Has DONE (verified) — ALL 11 DOMAINS NOW LANDED
All committed (each = API `server/src/api/<d>.js` + client `client/src/api/<d>.ts` + React pages):
- Notifications `d73c19d` · Companies `bbbfe08` · Campaigns `44ec9a6` · Work `d75cb15` · Tasks `03621fc` · Team `1e1fe13` · Settings `4520784` · Mail `23dd117` · Integrations `eef77f1` · Audit `9a2ad20` · Search `afd0d7c`.
- So API surface now present for: auth, dashboard, customers, campaigns, work, companies, tasks, notifications, team, settings, mail, integrations, audit, search (14 modules in `server/src/api/`).

## Endpoint parity snapshot (EJS endpoints vs React endpoints)
auth 11→7 (added forgot/reset/admin-recovery 2026-09-04) · dashboard 21→4 · customers 23→9 · companies 14→8 · settings 21→12 · team 10→8 · work 10→8 · integrations 10→6 · campaigns 6→6(✅) · mail 5→6(✅) · notifications 3→4(✅) · audit 1→1(✅) · **clients 2→2 (Codex won-customer sub-view)** · search 1→1.
**Biggest endpoint gaps (all in EJS, not yet in React API):** dashboard (21), customers (23), settings (21). These are feature-completeness gaps to close — the React apps mostly implement the core list/detail/CRUD but not every sub-action/filter/report the EJS has.

## My (OpenCode) DONE since baseline (session 2026-09-03/04)
14. ✅ **Fixed multi-CRM/500 bug (CRITICAL):** the copied models were never required at boot, so mongoose `populate` refs (e.g. `User -> CustomRole`) threw `MissingSchemaError` → **every authenticated API returned HTTP 500**. Fix: added "REGISTER ALL MONGOOSE MODELS AT BOOT" block to `server/src/server.js` requiring all 24 models. Verified all 8+ routes return HTTP 200 after fix. (Fix got swept into an Antigravity commit via their `git add -A`.)
15. ✅ **Built the Signup flow** (it was a placeholder):
    - Added `signup()` to `AuthContext` (stores token + loads full context).
    - Created `client/src/pages/auth/SignupPage.tsx` (name, orgName, email, password ≥8, login link).
    - Wired `/auth/signup` → `<SignupPage />` in `App.tsx` (replacing `<div>Signup TODO</div>`).
16. ✅ **Ownership/clients fix:** `/clients` = won-customer sub-view of Customer domain → **assigned to Codex** (in OWNERSHIP.md). Signup → OpenCode.
17. ✅ **Coord docs updated:** SYNC.md + OWNERSHIP.md + this file.
18. ✅ **Auth flow parity DONE (2026-09-04):** added JSON `POST /forgot-password`, `POST /reset-password`, `POST /admin-recovery` to `server/src/api/auth.js` + `canCreateSignupAccount` guard on signup; `authApi.forgotPassword/resetPassword/adminRecovery` in `client/src/api/auth.ts`; new `ForgotPasswordPage.tsx` + `ResetPasswordPage.tsx`; "Forgot password?" link on `LoginPage`; routes registered in `App.tsx` (`/auth/forgot-password`, `/reset-password`, `/auth/reset-password`). Verified live against booted server + `tsc`/`vite build` green.
19. ✅ **UI GAP AUDIT (2026-09-04, session):** Produced a page-by-page gap audit of React vs the EJS original, distilled into priority list (biggest gaps: work board/calendar views, settings work-types editor + automations, work-detail parity, lead duplicates page, work CSV import, dashboard greeting/pinning, error pages, inline-style consolidation). Saved working notes to `D:\vandecrmreact\GAP_REPORT.md`.
20. ✅ **STRUCTURAL LAYOUT FIXES (2026-09-04, session)** — these were the true root causes of the "significant UI gap":
    - **`.main-wrap` displacement/overlap (CRITICAL):** `AppLayout.tsx` was rendering the app body inside `<div className="main-content">` which has NO `margin-left`, so every page sat under the fixed 240px sidebar. Fixed by switching the wrapper to `<div className="main-wrap">` (and toggling `.main-wrap.expanded` when the sidebar is collapsed) — the real CSS class drives `margin-left: 240px` + the `.sidebar.collapsed ~ .main-wrap` sibling rule.
    - **Collapsed sidebar hover-expand broken:** `Sidebar.tsx` was removing `<span>` text and `.user-info` from the DOM with `{isOpen && ...}`, so on hover-expand the expanded strip was empty. Fixed by always rendering the text and letting the existing CSS (`.sidebar.collapsed .nav-item span`, `.sidebar.collapsed:hover .nav-item span`, `.sidebar.collapsed .user-info`, `.sidebar.collapsed:hover .user-info`, `.sidebar-footer-tools`) handle show/hide. Also un-gated the workType sub-links behind `isOpen`.
    - **Lead-detail styling dead (19.9 KB dead CSS):** `CustomerDetailPage.tsx` used invented classes (`.lead-detail-page`, `.lead-profile-hero`, `.lead-detail-nav-tabs`, `.lead-detail-grid`) while the entire `lead-detail.css` system is scoped under `.lead-record-ui` with reference classes (`.lead-detail-head`, `.lead-identity`, `.lead-profile-grid`, `.lead-main-column`, `.lead-side-column`, `.lead-overview-card`, `.lead-quick-card`, `.lead-stage-card`, `.lead-owner-card`, `.lead-controls-card`, `.lead-followup-panel`, `#activityForm`, `.timeline`...). Rewrote the page to render under `.lead-record-ui` using those class names (2-col profile grid, quick-summary sidebar, stage/owner selectors, follow-up panel), preserving edit/delete/tab functionality. Added a React-adaptation block to `lead-detail.css` (button-based `.lead-section-nav`, `.lead-timeline-*`, `.lead-detail-breadcrumbs`, `.lead-tab-pane`, `.lead-notes`) since the page uses state-driven buttons instead of EJS anchor tabs.
    - Verified `npx tsc --noEmit` green for all three fixes.
    - **NOTE:** `CustomerDetailPage.tsx` is Codex-owned (OWNERSHIP). I edited it for the parity fix; flagging it here so Codex is aware. The structural shell files (AppLayout/Sidebar) are OpenCode-owned.
    - **STILL OPEN (next biggest gaps):** settings work-types editor + automations, work-detail parity, lead duplicates + work CSV import pages, dashboard greeting/pinning, error pages, inline-style consolidation.
21. ✅ **WORK LIST BOARD + CALENDAR VIEWS (2026-09-04, session):** Ported `work/index.ejs` into `WorkListPage.tsx`:
    - `.view-switcher` toggle (list / board / calendar) gated by `presentation.enabledViews`, defaulting to `presentation.defaultView`; filters (status/priority) preserved across view switches via query params.
    - `.work-board` kanban: per-status `.work-column`s with HTML5 drag-drop → calls the existing `PATCH /work/:type/:id/status` quick-update on drop.
    - `.work-calendar` month grid: month navigation (prev/current/next), items bucketed by `presentation.calendarField` (default `deadline`, handles `custom:` keys); `month` & `view` params drive the backend filter.
    - List view now renders the subtask-tree expansion (grouped by `parentRecord`, counts completed via terminal-won statuses).
    - Backend (`server/src/api/work.js`): added live `month` query filter to the list endpoint + `pageSize` default raised to 25→100 + list now populates `parentRecord`. Client types `WorkType` gained `presentation`; `WorkItem` gained `parentRecord`/`relatedRecords`.
    - Verified: `node --check`, `npx tsc --noEmit` exit 0, `vite build` green.
22. ✅ **SPOTLIGHT SEARCH MODAL (2026-09-04, session):** Added `client/src/components/SearchModal.tsx` — a **React-idiomatic** popup (uses app tokens `--gold/--panel/--border` + inline styles, NOT the EJS `search.css` block, per user preference). Same feature set as the EJS spotlight: category tabs (Everything/Leads/Clients/Work & Tasks/Meetings & Activity/Work History/Team), date/from/to/field filters, recent searches (localStorage), quick-access KPI cards (live `searchApi.query` stats), top/live results with keyboard nav (↑/↓/Enter/Esc). `TopBar.tsx` opens it on the `.topbar-search-bar` click and on **Ctrl/Cmd+K**. `/search` page retained as the deep "More filters" target. `tsc` + `vite build` green. **Committed in `0beba29`.**
23. ⚠️ **DEEP GAP ANALYSIS — Dashboard / Leads / Clients / Detail views (2026-09-04, session):** Detailed side-by-side audit vs EJS added to `GAP_REPORT.md` covering 5 screens. Summary of what's missing in React (all queued as owned work):
    - **Dashboard:** tinted KPI icon containers (`getCardTheme`), 2-col card-pinning modal, weekly chart today-highlight + tooltips, rich pipeline kanban cards (brand tag, priority badge, WhatsApp/Call buttons, follow-up badge, assignee avatar).
    - **Leads table:** horizontal stage-filter pills w/ counts, 32px avatar circles (`getAvatarColor`), WhatsApp/Call quick-actions, Hot Lead/High Potential badges, sticky header + frozen first column.
    - **Clients table:** portfolio KPI cards, won-deal value tags, active-project counts, account-manager avatar column.
    - **Lead detail:** 1-click contact strip, Quick Activity Composer (Call/WhatsApp/Message/Note w/ instant timeline refresh), follow-up quick-postpone (+1d/+3d/+1w), persistent right-sidebar controls.
    - **Client detail:** client summary KPI grid, linked work items w/ progress bars + module badges, documents/folders + preview popup.
24. ✅ **DASHBOARD PARTIAL PARITY (2026-09-04, session):** Added `getCardTheme`/`ICON_PALETTE` + tinted `.dashboard-metric-icon` metric cards (CSS var `--metric-accent`), richer pipeline `.deal-card` (deal-name, label pills, deal-meta, deal-owner avatar, deal-value footer), weekly chart with `<details>` `.bar-col` + `.weekly-day-popover` tooltips displaying per-day `items`. Backend `dashboard.js` now returns per-day `items` in `weeklyWorkProgress`. Only dashboard gap left: card-pinning modal.
25. ✅ **SETTINGS CLOSED (2026-09-04, session):** Custom-modules (work-types) builder + Automations fully landed (backend `settings.js` new routes + `WorkTypeBuilder.tsx` + `AutomationsTab.tsx` + SettingsPage integration). Verified `npm run build` green, server restarted (port 5000). See tracker items #6/#7.
26. ✅ **CODEX DEPARTURE / TAKEOVER (2026-09-04):** Codex reached its assistance limit and **will not return**. OpenCode formally assumed the former-Codex domains (Dashboard, Customers/Leads, Clients + detail views) per OWNERSHIP.md. Remaining Codex-owned parity gaps = tracker items #1(partial)→#5. Next focus: Leads table parity, then Lead detail, then Client detail, then Dashboard pinning modal.
27. 🔧 **ANTIGRAVITY UNCOMMITTED WORK PRESENT IN WORKING TREE (verify/commit):** WorkDetailPage 100% parity, WorkListPage board/calendar + CSV import dialog, error pages (404/403), App.tsx routes, MailPage/CompanyDetailPage touches, `server/src/api/work.js` import endpoint. Their PROGRESS doc reports ALL 11 domains + advanced features complete (tsc + build verified green in the working tree as of 2026-09-04).

## IN PROGRESS / NEXT FOR ME (OpenCode)
A. ✅ **Auth endpoints DONE (2026-09-04):** added JSON `forgot-password`, `reset-password`, `admin-recovery` to `server/src/api/auth.js` mirroring `src/routes/auth.js` (generic no-enumeration forgot message, sha256 token hash + 1h expiry, recovery-key via env `ADMIN_RECOVERY_KEY`). Added `signup` public-signup guard (`canCreateSignupAccount`). Client: `authApi.forgotPassword/resetPassword/adminRecovery` in `api/auth.ts` + `ForgotPasswordPage.tsx` + `ResetPasswordPage.tsx` + "Forgot password?" link on Login + routes `/auth/forgot-password`, `/reset-password`, `/auth/reset-password` in `App.tsx`. Verified: `node --check`, server `/health`, live probes (forgot → generic message; reset bad token → 400 invalid/expired; admin-recovery disabled → 404), client `tsc --noEmit` + `vite build` green. All 18 API modules load.
B. ✅ **Console warnings DONE:** React Router future flags + TopBar SVG camelCase fixed (prior session).
C. ✅ **Multi-CRM / UI parity DONE (prior session + 2026-09-04):** Sidebar now has the CRM workspace switcher (`crm-switcher`/`crm-workspace-item`). Icons: `lucide-react@1.40.0` installed, `Icons.tsx` uses full Lucide catalog. Chrome shell aligned with EJS (see item E below). `/portfolio`, `/analytics`, `/reports` routes + nav.
D. ✅ **Register remaining routes DONE:** all domains mounted in `server.js` + `App.tsx` (incl. clients, portfolio, analytics, reports).
E. ✅ **Chrome Shell UI Parity DONE (2026-09-04):**
   - **Theme engine bootstrap:** added synchronous `<head>` script to `index.html` that reads `ui-density` + `theme-preset`/`theme-name` from localStorage and applies CSS vars + `data-theme`/`dark-theme` before first paint — matching EJS `head.ejs` exactly. Default: Classic Dark. `AuthContext.applyTheme` now a no-op when no org theme (no longer clobbers saved preset on logout/public pages).
   - **Icons:** installed `lucide-react@1.40.0`, rewrote `Icons.tsx` to use real Lucide components (full catalog) instead of hand-rolled 30-icon SVG registry.
   - **Sidebar:** renamed `.sidebar-header` → `.sidebar-logo` (enables 15+ EJS collapse/padding rules); added `.sidebar-footer` with `.sidebar-footer-tools` (Customize + Reset) + `.sidebar-user` card (initials avatar, name, role, logout button). Nav items now `<a><Icon/><span/></a>` matching EJS structure (no more `.nav-icon`/`.nav-label` wrapper spans). CRMs nav uses `folder-kanban`; Follow-ups uses `list-checks`; Team uses `user-check`; Audit uses `activity`.
   - **TopBar:** added `LiveClock` (IST, ticks every second); added 4-preset `theme-picker` menu (Classic Dark / OLED Black / Cozy Cream / Crystal Light) with localStorage persistence; search changed from `<form>` with `<input>` to clickable `.topbar-search-bar` trigger div that opens the **SearchModal spotlight popup** (see entry 22); added mobile hamburger `.mobile-menu-btn`; user card changed from dropdown to EJS-style `.topbar-user` (always visible: initial + name + email).
   - Verified: `tsc --noEmit` exit 0 + `vite build` green (464KB JS, 356KB CSS).

F. **Remaining (my ownership) when time permits:** admin-recovery *page* (API done; UI not wired); continue closing per-module sub-action/filter endpoint parity gaps; ensure `index.css` parallel classes (`.stat-card` etc.) are replaced with EJS classes (`.business-panel`, `.dashboard-metric`, etc.) — documented in `docs/REACT-PATTERNS.md`.

## UI PARITY TRACKER (2026-09-04 — REBASED AFTER ALL CODEIGHT-OWNED ITEMS LANDED)
✅ **All former-Codex-owned domains are now committed and the working tree is CLEAN.**
> **IMPORTANT — Codex departed 2026-09-04 permanently and will NOT return.** Former-Codex domains were SPLIT per user decision: **OpenCode owns Dashboard + Customers/Leads** (incl. duplicates); **Antigravity owns Clients** (won-customer sub-view + client detail). See OWNERSHIP.md.
1. ✅ **Dashboard parity** — DONE (metric-icon card theming `getCardTheme`/`.dashboard-metric-icon`, weekly chart today-highlight + tooltips, rich pipeline kanban cards). *REMAINING only if pursued: 2-col card-pinning modal (`#dashboardCustomizeDialog`).*
2. ✅ **Leads table parity** — DONE (stage-filter pills w/ counts, 32px avatar circles `getAvatarColor`, priority badges, stick behavior, view tabs All/New/Assigned/Qualified/Recently updated/High Potential/Overdue). Committed.
3. ✅ **Clients table parity** — **DONE by Antigravity** (avatar pills, WhatsApp/Call quick links, priority badges, KPI metrics) — commit `5b2a78a`.
4. ✅ **Lead detail parity** — DONE (Codex's complete composer: tabbed Note/Call/Email/WhatsApp/Meeting/Task activities `handleLogActivity`, timeline search/filter, follow-up date/time, quick-reschedule, attachments manager, stage/owner sidebar controls). Committed.
5. **Client detail parity** — client summary KPI grid (`.client-summary-grid`), linked work items tab w/ progress bars + module badges, documents/folders + preview popup. **(Antigravity's Clients domain — verify/commit.)**
6. ✅ **Settings: Custom modules (work-types) builder** — DONE (`WorkTypeBuilder.tsx`, workTypes routes).
7. ✅ **Settings: Automations** — DONE (`AutomationsTab.tsx`, automations routes).
8. ✅ **Work detail parity** — DONE (~100% EJS, Antigravity). Committed in `ba05944`.
9. ✅ **Lead duplicates page** — DONE (`DuplicatesPage.tsx` review + merge). Committed in `2b4bb21`.
10. ✅ **Error pages** 403/404/500 — DONE (Antigravity `NotFoundPage`/`ForbiddenPage`). Committed.
11. **Inline-style consolidation** — STILL OPEN (low priority): replace remaining ad-hoc `style={{...}}` with EJS classes.

## SESSION-COMPLETE NOTES (2026-09-04) — for future-me
- **State:** Everything is committed, working tree is CLEAN. Local-only (no `origin` remote).
- **Split (post-Codex):** OpenCode = Dashboard + Customers/Leads (+duplicates); Antigravity = Clients. Do NOT work Antigravity's Clients files without coordination even though they were touched this session.
- **CODE-MODE LESSON (critical for concurrent agents):** Antigravity is ACTIVE and committing concurrently via `git add -A`. During this session a stale `read` made me re-add duplicate state that Codex/Antigravity had already implemented, causing TS2451 redeclaration errors. **ALWAYS re-`git status` + re-`read` shared pages immediately before editing them, and after every remote-style commit, to detect concurrent changes. Verify my edits still exist afterward** (their `git add -A` can sweep mine up or conflict).
- **ClientsPage concurrency example:** Antigravity committed the Clients avatar-pill parity as `5b2a78a` while I was finishing the split docs — my own ClientsPage `git commit` found "nothing to commit, working tree clean" because Antigravity had already landed the SAME change. Expect this vacillation.
- **Next OpenCode move — INDEPENDENT AUDIT BACKLOG (see `docs/REACT-MIGRATION-GAP-AUDIT.md`, saved fresh 2026-09-04):**
  1. **3.1** Dashboard customize/pin dialog (two-panel Available/Pinned, drag-reorder, section toggles; per-user persist via new `POST /api/dashboard/preferences` → `dashboardCardsCustomized`/`HiddenCards`/`CardOrder`).
  2. **3.2** Dashboard "movement" grid (`dashboard-movement-grid`, perm-gated: `businesses.view`/`ads.view`/work-module view) + `#movementPreviewDialog`.
  3. **4.1** Sticky/frozen first-column + header on leads table (`CustomersPage.tsx`; EJS uses `table-scroll.js`). 🟡
   4. **4.2** ✅ RESOLVED 2026-09-04: "Hot" is a summary KPI only (`leadStats.hotLeads`, EJS:761), NOT a per-row badge; already ported at `CustomersPage.tsx:261-262`. No work needed.
  5. **7.1** Build shared `<ConfirmDialog>` (EJS `.simple-dialog` style) in `client/src/components/`; then swap `window.confirm()` in my 4 files (`CustomerDetailPage`×2, `CustomersPage`×1, `DuplicatesPage`×1) + hand component to Antigravity for its 11.
- **Antigravity's next work (coordination only):** §5 Companies (six missing sections — biggest gap in project), §6 Integrations help/checklist panels, §7.1 swap in its 11 files.
- **Do NOT re-task (all verified complete by audit):** work board/calendar/drag-drop, work detail subtasks, work-type builder, automations, duplicates merge, CSV import, notifications bell, error pages, auth reset routes, Spotlight search, models/data layer.

## Verification Commands (fresh 2026-09-04)
- Server boot + route probe: `cd server; node src/server.js` (or Start-Process w/ PORT=5099). Then with a JWT: `Invoke-WebRequest http://localhost:PORT/api/<route> -Headers @{Authorization="Bearer <token>"}` — expect HTTP 200.
- Client typecheck: `cd client; npx tsc --noEmit` (exit 0 = green).
- Client prod build: `cd client; npx vite build`.
- Server module load: `node -e "['auth','...'].forEach(m=>require('./src/api/'+m))"` from `server/` (NOTE: paths are `./src/api/`, not `./api/`).
- Original reference: routes `D:\VandeAgencyCRM\src\routes\*.js`; EJS views `D:\VandeAgencyCRM\src\views\`.

## Coordination Rules to Never Forget
- Always read `docs/package/SYNC.md` (the live tracker) at session start.
- Respect OWNERSHIP.md — never edit Codex/Antigravity files (Sidebar/TopBar/App.tsx/server.js/auth.js = OpenCode).
- Shared file changes (types, client.ts, middleware, server.js) go through SYNC.md requests.
- Antigravity/Codex commit with `git add -A` — they may sweep my uncommitted work into their commits; expect the working tree to vacillate. VERIFY my changes still exist after they commit.
- No git remote `origin` — commits are local-only.
- User priorities (recent): (1) COMPLETE the migration fast; (2) match/deeply improve the UI to the EJS original (multi-CRM switcher, icons, analytics/reports/portfolio); (3) close the functional gap so nothing from the EJS is missing.
