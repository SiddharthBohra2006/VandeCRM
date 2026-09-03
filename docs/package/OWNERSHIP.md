# OWNERSHIP.md — Domain Boundaries & Junction Points

**Purpose:** Define exactly who owns what so developers never collide. Read this in addition to SYNC.md. If a file is not listed as yours, you do NOT edit it unless the change is requested and logged through SYNC.md.

## The Three Developers

| Developer | Role |
|---|---|
| **OpenCode** | Lead architect — shared infra, auth, routing, types, coordination docs |
| **Codex** | Dashboard + Customers/Leads |
| **Antigravity** | All other 11 functional domains |

## Ownership Tables

### OpenCode (Lead Architect)
- `server/src/server.js` — server entry, boot, ALL route registration
- `server/src/api/auth.js` — auth API (login/signup/me/switch-company)
- `server/src/api/middleware/auth.js` — `requireApiAuth`, `requireApiPermission`, JWT
- `client/src/api/client.ts` — shared fetch wrapper
- `client/src/api/auth.ts` — auth client
- `client/src/types/index.ts` — shared TS types
- `client/src/App.tsx` — route architecture
- `client/src/contexts/AuthContext.tsx` — global auth context
- `client/src/layouts/*`, `client/src/components/Sidebar.tsx`, `TopBar.tsx` — app shell
- `package.json`, `tsconfig.json`, `.gitignore`, `.nvmrc`
- `docs/package/SYNC.md`, `docs/package/OWNERSHIP.md`, `docs/package/OPNREC-CONTEXT.md`
- Backend shared folders copied from original (they are shared read-only reference): `server/src/{models,services,utils,config,middleware,routes}`

### Codex
- `server/src/api/dashboard.js`
- `server/src/api/customers.js`
- `client/src/pages/dashboard/DashboardPage.tsx`
- `client/src/pages/customers/CustomersPage.tsx`, `CustomerDetailPage.tsx`, `CustomerFormPage.tsx`
- `client/src/api/customers.ts` (domain client)
- `docs/CODEX-PROGRESS.md`

### Antigravity
- API: `server/src/api/{notifications,companies,campaigns,work,tasks,team,settings,mail,integrations,audit,search}.js`
- Client API: `client/src/api/{notifications,companies,campaigns,work,tasks,team,settings,mail,integrations,audit,search}.ts`
- Pages: `client/src/pages/{notifications,companies,campaigns,work,tasks,team,settings,mail,integrations,audit,search}/...`
- Contexts (if any new): e.g. `NotificationContext`
- `docs/ANTIGRAVITY-PROGRESS.md`

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
