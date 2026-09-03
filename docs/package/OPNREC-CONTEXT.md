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

| Developer | Owns |
|---|---|
| **OpenCode (me)** | Auth, JWT middleware, server entry/boot, shared `api/client.ts` + `types`, backend copy, route registration, coordination docs |
| **Codex** | Dashboard + Customers |
| **Antigravity** | The other 11 domains |

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
- Dashboard API `server/src/api/dashboard.js` — FULL implementation (workspace-scoped, permissions, preferences, pipeline move). Verified boots; returns 401 JSON without token.
- Dashboard React page — in progress.
- Customers API still boot stub.
- Maintains `docs/CODEX-PROGRESS.md`.

## What Antigravity Has DONE (verified)
- Plan laid out; not started implementation. Maintains `docs/ANTIGRAVITY-PROGRESS.md`. Starting Step 1 (Notifications).

## Verification Commands
- Server boot: `node server/src/server.js` (from `server/`), check `/health`.
- Client typecheck: `cd client && npx tsc --noEmit` (exit 0 = green).
- Server module load: `node -e "require('./src/server.js')"` style spot-checks.
- Original reference routes: `D:\VandeAgencyCRM\src\routes\*.js`; EJS views: `D:\VandeAgencyCRM\src\views\`.

## Current Next Steps FOR ME (OpenCode)
1. **Commit the styling foundation** + the in-flight Codex/Antigravity working tree as a clean checkpoint (git add/commit).
2. Chore coordination: make sure Codex (Dashboard/Customers) and Antigravity (all other domains) adopt the EJS-class-name parity rule from REACT-PATTERNS.md so their pages render with the real design system.
3. As domains land, merge route registration into `server.js` and add client `<Route>`s.
4. Keep `SYNC.md` and this file updated as the migration progresses.

## Coordination Rules to Never Forget
- Always read `docs/package/SYNC.md` (the live tracker) at session start.
- Respect OWNERSHIP.md — never edit Codex/Antigravity files.
- Shared files changes (types, client.ts, middleware, server.js) go through SYNC.md requests.
- Update this file + SYNC.md at every milestone so cross-session memory is never lost.
