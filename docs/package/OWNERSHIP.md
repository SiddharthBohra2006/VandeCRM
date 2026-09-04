# OWNERSHIP.md — Domain Boundaries & Junction Points

**Purpose:** Define exactly who owns what so developers never collide. Read this in addition to SYNC.md. If a file is not listed as yours, you do NOT edit it unless the change is requested and logged through SYNC.md.

> **2026-09-04 — DEVELOPER RETIREMENT & OWNERSHIP SPLIT:** **Codex has left the project** (liaison capacity reached; will not return). Codex's former domains have been **split between the two remaining developers** (per user decision):
> - **OpenCode** assumes **Dashboard + Customers/Leads** (list, detail, form, duplicates).
> - **Antigravity** assumes **Clients** (won-customer sub-view + Client detail).
> All former-Codex work is complete and committed. See `OPNREC-CONTEXT.md` and `SYNC.md`.

## The Developers

| Developer | Role | Status |
|---|---|---|
| **OpenCode** | Lead architect — shared infra, auth, routing, types, coordination docs. **Owns former-Codex Dashboard + Customers/Leads.** | Active |
| ~~Codex~~ | ~~Dashboard + Customers/Leads + Clients (won-customer sub-view)~~ | **Departed (no longer returning)** — domains split between OpenCode (Dashboard+Customers) and Antigravity (Clients) |
| **Antigravity** | All 11 functional domains + **Clients (won-customer sub-view, from Codex)** | Active |

## Ownership Tables

### OpenCode (Lead Architect)
- `server/src/server.js` — server entry, boot, ALL route registration
- `server/src/api/auth.js` — auth API (login/signup/me/switch-company)
- `server/src/api/middleware/auth.js` — `requireApiAuth`, `requireApiPermission`, JWT
- `client/src/api/client.ts` — shared fetch wrapper
- `client/src/api/auth.ts` — auth client
- `client/src/types/index.ts` — shared TS types
- `client/src/App.tsx` — route architecture
- `client/src/pages/auth/LoginPage.tsx`, `client/src/pages/auth/SignupPage.tsx` — auth pages (Signup API exists; Signup page is OpenCode's to build)
- `client/src/contexts/AuthContext.tsx` — global auth context
- `client/src/layouts/*`, `client/src/components/Sidebar.tsx`, `TopBar.tsx` — app shell
- `package.json`, `tsconfig.json`, `.gitignore`, `.nvmrc`
- `docs/package/SYNC.md`, `docs/package/OWNERSHIP.md`, `docs/package/OPNREC-CONTEXT.md`
- Backend shared folders copied from original (they are shared read-only reference): `server/src/{models,services,utils,config,middleware,routes}`

### ~~Codex~~ → Split: OpenCode (Dashboard + Customers/Leads) & Antigravity (Clients)
> Former-Codex files. **OpenCode owns** (Dashboard + Customers/Leads, incl. duplicates):
- `server/src/api/dashboard.js`
- `server/src/api/customers.js`
- `client/src/pages/dashboard/DashboardPage.tsx`
- `client/src/pages/customers/CustomersPage.tsx`, `CustomerDetailPage.tsx`, `CustomerFormPage.tsx`, `DuplicatesPage.tsx`
- `client/src/api/customers.ts`

> ⚠️ **2026-09-04 one-off:** OpenCode edited `CustomerDetailPage.tsx` (+ `client/src/styles/lead-detail.css`) to rewire the page to the `.lead-record-ui` class system (fixes the dead-styling UI gap). Ownership stays with Codex; please review the diff. See SYNC.md UI PARITY TRACKER.

### Antigravity (11 functional domains + Clients from Codex)
- API: `server/src/api/{notifications,companies,campaigns,work,tasks,team,settings,mail,integrations,audit,search}.js`
- Client API: `client/src/api/{notifications,companies,campaigns,work,tasks,team,settings,mail,integrations,audit,search}.ts`
- Pages: `client/src/pages/{notifications,companies,campaigns,work,tasks,team,settings,mail,integrations,audit,search}/...`
- Contexts (if any new): e.g. `NotificationContext`
- `docs/ANTIGRAVITY-PROGRESS.md`
- **Clients (won-customer sub-view, taken over from Codex 2026-09-04):** `server/src/api/clients.js`, `client/src/api/clients.ts`, `client/src/pages/clients/ClientsPage.tsx` + Client detail (rendered via `CustomerDetailPage` for won customers)

> ⚠️ **2026-09-04 one-off:** OpenCode edited `client/src/pages/work/WorkListPage.tsx` (added board + calendar views to Antigravity's flat list page) and `server/src/api/work.js` (added `month` filter, `pageSize` 100, `parentRecord` populate) for the board/calendar parity port. Ownership stays with Antigravity; please review the diff (commit `0beba29`). See SYNC.md UI PARITY TRACKER.

## Strict No-Touch Rule
- Nobody edits `server/src/{models,services,utils,config,middleware,routes}` — these are copied from the original and are shared reference only.
- Nobody edits another developer's owned files (see tables above).
- NOBODY edits OpenCode's shared files (`types/index.ts`, `api/client.ts`, `middleware/auth.js`, `server.js`) without a request logged in SYNC.md.

## Junction Points (shared files with cross-domain impact)

These are the highest-risk coordination spots. OpenCode owns them; changes here cascade to everyone.

1. **`client/src/types/index.ts`** — shared interfaces (`Customer`, `WorkItem`, `Campaign`, `Company`, etc.). If a domain needs a new/updated type, request it via SYNC.md rather than editing directly. (OpenCode adds `CustomerInput`, `WorkInput`, etc. as needed.)
2. **`client/src/api/client.ts`** — the one fetch wrapper. No per-domain edits; import it.
3. **`server/src/api/middleware/auth.js`** — JWT auth & permission. Everyone uses `requireApiAuth` and (when needed) `requireApiPermission('module.action')`.
4. **`server/src/server.js`** — route registration. Every new module must be registered here. Add your module to the requires + `app.use('/api/...', apiX)` block (see pattern below). OpenCode merges these.
5. **`client/src/App.tsx`** — route definitions. Each new page domain adds a `<Route>` here.

## API Route Registration Pattern (Applies to Codex & Antigravity)

After creating `server/src/api/<domain>.js`, register it in `server/src/server.js`:

```js
// 1. Add require near the top:
const apiNotifications = require('./api/notifications');

// 2. Mount in the API section (do NOT add EJS middleware):
app.use('/api/notifications', apiNotifications);
```

Each API route file self-guards with JWT:
```js
const { requireApiAuth } = require('./middleware/auth');
const router = express.Router();
router.use(requireApiAuth);
// optional permission: router.use((req,res,next)=> hasPermission(req.user,'module.view') ? next() : res.status(403).json({ok:false,error:'Access denied'}))
```

## General Rules
- Every API response: `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`.
- All scoping uses `req.user.organization._id` and `req.activeCompanyId`.
- Every React page handles Loading, Error, Empty states.
- Keep pixel parity with original EJS views (`d:\VandeAgencyCRM\src\views\`).
