# SYNC.md — Live Master Coordination Tracker

**Purpose:** Single source of truth for coordination across the 3 developers (OpenCode, Codex, Antigravity). Every developer MUST read this first when starting and update it when they finish a milestone. This is how we stay on the same page.

## Roles & Ownership (summary — full detail in OWNERSHIP.md)

| Developer | Role | Owns |
|---|---|---|
| **OpenCode** | Lead architect | Auth API, JWT middleware, server entry/boot, shared `client/src/api/client.ts` + `client/src/types`, backend copy, route registration in `server/src/server.js`, coordination docs |
| **Codex** | Domain dev | Dashboard + Customers (API + React pages) |
| **Antigravity** | Domain dev | Notifications, Companies, Campaigns, Work, Tasks, Team, Settings, Mail, Integrations, Audit, Search |

## Current Status (last updated: reality-check + ownership fixes)

### ✅ Green Foundation (OpenCode) — CONFIRMED
- Git repo initialized + **clean initial commit** (node_modules excluded via `.gitignore`, line endings normalized via `.gitattributes`).
- Shared backend copied from original: `server/src/{models,services,utils,config,middleware,routes}`.
- Server **boots** and connects to Mongo; `/health` OK (verified).
- API routes `/api/auth`, `/api/dashboard`, `/api/customers`, `/api/notifications` mounted; each route self-guards with JWT (`requireApiAuth`).
- Client **typechecks green** (`npx tsc --noEmit` exit 0, verified).
- Entry point is `server/src/server.js` (CommonJS — matches copied backend). The old `server.ts` TS entry was REMOVED (fixes Codex finding re: TS compile failure).
- Node 20 pinned via `.nvmrc` + `engines` in `package.json`.

### ✅ Styling Foundation (OpenCode) — NEW
- Original design system now imported into the React client: `client/src/styles/{app,auth,lead-detail,search}.css` copied from `D:\VandeAgencyCRM\public\css\`.
- `client/src/index.css` rewritten: imports the real system + thin React glue (no generic blue/gray overrides). Vite bundles it (build green, 335KB CSS verified).
- Org theme applied at runtime: `AuthContext` sets CSS vars (`--gold/--teal/--bg/--panel/--text/...`) + `data-theme`/`dark-theme` on `<html>` from `user.organization.theme` (exposed via `/auth/me`, typed in `User`).
- **Parity rule added to REACT-PATTERNS.md:** all pages must use ORIGINAL EJS class names (`page-head`, `dashboard-head`, `btn`, `leads-table-top-bar`, etc.), NOT invented `.page-header`/`.stats-bar`/`.form-card`. Agents must mirror the EJS class names for the true look.

### ✅ Committed & Functional
- **Codex:** Dashboard API `server/src/api/dashboard.js` COMPLETE; Dashboard React page in progress; Customers API (`server/src/api/customers.js`) in progress.
- **Antigravity:** Notifications, Companies, & Campaigns complete (API + pages); Work domain in progress (Step 4).

### 🔶 In Progress
- **Codex:** Dashboard API `server/src/api/dashboard.js` COMPLETE; Dashboard React page in progress; Customers API (`server/src/api/customers.js`) in progress.
- **Antigravity:** Notifications, Companies, Campaigns, Work, Tasks, & Team complete (API + pages); Settings domain in progress (Step 7).

### ⚪ Pending Domains (Antigravity Queue)
- Settings → Mail → Integrations → Audit → Search.

### 📌 Clients — OWNERSHIP CLARIFIED
- `/clients` ("won clients") is a SUB-VIEW of the Customer domain, NOT a separate domain. Original `clients.js` filters the same `Customer` model by won stages; original `customers/index.ejs` renders both via an `isClientView` flag. **Owned by Codex**, along with Customers. Route to be registered by OpenCode when Codex lands it.

## Job Queue (what happens next)

1. **Codex:** CSV import/export → regression checks → browser parity testing → Clients (won-customer sub-view) integration.
2. **Antigravity:** Campaigns → Work → Tasks → Team → Settings → Mail → Integrations → Audit → Search. **(GO continues — approved on baseline confirm.)**
3. **OpenCode:** build the Signup page (API already exists) → merge/register every new domain into `server.js` + client `<Route>`s in `App.tsx` → keep `SYNC.md` + `OPNREC-CONTEXT.md` current.

## Blockers / Open Items

- None blocking at this time. Codex's earlier blockers all resolved by OpenCode foundation (write access is a workspace permission controlled by the user, not in-code).
- **Route registration:** when Antigravity adds a module, OpenCode (or Antigravity per pattern) must register it in `server/src/server.js` and add the client route in `App.tsx`.

## Junction Points (shared files — see OWNERSHIP.md)

- `client/src/types/index.ts` — OpenCode owns. Do NOT edit without coordination (extends across all domains).
- `client/src/api/client.ts` — OpenCode owns. Everyone imports from it.
- `server/src/api/middleware/auth.js` — OpenCode owns (`requireApiAuth`, `requireApiPermission`).
- `server/src/server.js` — OpenCode owns route registration.

---

## Change Log
- **Baseline:** OpenCode set up git, copied backend, fixed server entry (`.js`), fixed priority type junction, created DashboardPage placeholder, added `requireApiPermission`, verified green boot + typecheck.
- **Styling Foundation:** OpenCode imported the original design system into the React client (styles + theme application) and added the EJS-class-name parity rule to REACT-PATTERNS.md.
