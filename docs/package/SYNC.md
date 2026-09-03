# SYNC.md — Live Master Coordination Tracker

**Purpose:** Single source of truth for coordination across the 3 developers (OpenCode, Codex, Antigravity). Every developer MUST read this first when starting and update it when they finish a milestone. This is how we stay on the same page.

## Roles & Ownership (summary — full detail in OWNERSHIP.md)

| Developer | Role | Owns |
|---|---|---|
| **OpenCode** | Lead architect | Auth API, JWT middleware, server entry/boot, shared `client/src/api/client.ts` + `client/src/types`, backend copy, route registration in `server/src/server.js`, coordination docs |
| **Codex** | Domain dev | Dashboard + Customers (API + React pages) |
| **Antigravity** | Domain dev | Notifications, Companies, Campaigns, Work, Tasks, Team, Settings, Mail, Integrations, Audit, Search |

## Current Status (last updated: foundational baseline)

### ✅ Green Foundation (OpenCode)
- Git repo initialized (`D:\vandecrmreact`).
- Shared backend copied from original: `server/src/{models,services,utils,config,middleware,routes}`.
- Server boots, connects to Mongo, `/health` OK.
- API routes `/api/auth`, `/api/dashboard`, `/api/customers` mounted; each route self-guards with JWT (`requireApiAuth`).
- Client typechecks green (`npx tsc --noEmit` exit 0).
- Entry point is `server/src/server.js` (CommonJS — matches copied backend). The old `server.ts` TS entry was REMOVED (fixes Codex finding re: TS compile failure).
- Node 20 pinned via `.nvmrc` + `engines` in `package.json`.

### 🔶 In Progress
- **Codex:** Dashboard API `server/src/api/dashboard.js` COMPLETE; Dashboard React page in progress; Customers API (`server/src/api/customers.js`) still a boot stub.

### ⚪ Not Started
- **Antigravity:** all assigned domains (Notifications first).

## Job Queue (what happens next)

1. **Codex:** finish Dashboard React page → then Customers (API-first, then pages).
2. **OpenCode:** reviewing/merging Codex's route registration; keep `server.js` entry updated as Antigravity adds modules.
3. **Antigravity:** Notifications → Companies → Campaigns → Work → Tasks → Team → Settings → Mail → Integrations → Audit → Search.

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
