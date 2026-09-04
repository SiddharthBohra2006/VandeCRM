# SYNC.md — Live Master Coordination Tracker

**Purpose:** Single source of truth for coordination across the developers (OpenCode, Antigravity). Every developer MUST read this first when starting and update it when they finish a milestone. This is how we stay on the same page.

## Roles & Ownership (summary — full detail in OWNERSHIP.md)

| Developer | Role | Owns |
|---|---|---|
| **OpenCode** | Lead architect | Auth API, JWT middleware, server entry/boot, shared `client/src/api/client.ts` + `client/src/types`, backend copy, route registration in `server/src/server.js`, shell (`AppLayout`, `TopBar`, `Sidebar`), Dashboard, Customers/Leads, Duplicates, coordination docs |
| **Antigravity** | Domain dev | Notifications, Companies, Campaigns, Work, Tasks, Team, Settings (Work Type Builder + Automations), Mail, Integrations, Audit, Search, Clients (won-customer sub-view), ConfirmDialog |

## Current Status (last updated: 2026-09-04)

### ✅ Green Foundation (OpenCode) — CONFIRMED
- Git repo initialized + clean commit history.
- Shared backend copied from original: `server/src/{models,services,utils,config,middleware,routes}`.
- Server boots and connects to Mongo; `/health` OK.
- API routes mounted with JWT authentication (`requireApiAuth`).
- Client typechecks green (`npx tsc --noEmit` exit 0, verified).
- Entry point is `server/src/server.js` (CommonJS).
- Node 20 pinned via `.nvmrc` + `engines` in `package.json`.

### ✅ Styling Foundation (OpenCode) — CONFIRMED
- Original design system imported: `client/src/styles/{app,auth,lead-detail,search}.css`.
- `client/src/index.css` applies the real CSS variables (`--gold/--teal/--bg/--panel/--text/...`) + `data-theme` dynamically at runtime.
- Vite bundles it cleanly (360KB CSS verified).

### ✅ Committed & Functional Domains (Antigravity & OpenCode)
- **All 11 Domain Packages 100% COMPLETE & VERIFIED:**
  1. Notifications (`/api/notifications`, dropdown bell, real-time unread badges)
  2. Companies (`/companies`, `/companies/:id`, 10-card metric grid, inline lead form, stored documents table, activity stream, collaborators)
  3. Campaigns (`/campaigns`, `/campaigns/:id`, spend/leads/CPR/conversion metrics, live toggle)
  4. Work (`/work`, `/work/:type`, view toggle: list + subtask tree, drag-and-drop board, month calendar; `/work/:type/:id` detail with rich subtask composer, custom fields, audit log)
  5. Tasks (`/tasks`, follow-up center tabs, inline reschedule & completion)
  6. Team (`/team`, members list, invite, roles permissions matrix)
  7. Settings (`/settings`, 7 tabs: stages, fields, labels, terminology, appearance, custom modules builder `WorkTypeBuilder.tsx`, automations engine `AutomationsTab.tsx`)
  8. Mail (`/mail`, 3-pane layout, template merge tags, SMTP test)
  9. Integrations (`/integrations`, Meta Ads & GA4 step-by-step guides & checklists, webhook live code generation)
  10. Audit (`/audit`, searchable action trail)
  11. Search (`/search` deep filter page + Spotlight Search modal with `Ctrl/Cmd+K`)
  12. Clients (`/clients`, 4-card portfolio KPI summary, won-deal values)
  13. Universal Modals (`ConfirmDialog.tsx` integrated across all pages)

---

## Change Log
- **Baseline:** OpenCode set up git, copied backend, fixed server entry (`.js`), fixed priority type junction, created DashboardPage placeholder, added `requireApiPermission`, verified green boot + typecheck.
- **Styling Foundation:** OpenCode imported the original design system into the React client (styles + theme application) and added the EJS-class-name parity rule to REACT-PATTERNS.md.
- **UI Parity structural fixes (2026-09-04):** OpenCode fixed AppLayout `.main-wrap`, hover-expand sidebar, lead-detail `.lead-record-ui` styling, work list **board + calendar** views, and Spotlight SearchModal (`Ctrl/Cmd+K`).
- **Migration-completion final pass (2026-09-04, OpenCode + Antigravity):** Closed the last backend/UX gaps from a full 41-view EJS↔React parity sweep (see GAP_REPORT.md §4b):
  - OpenCode: work record automation (`runRecordAutomation`), recurring monthly records (`ensureMonthlyRecords`), dashboard view save endpoint, customer import template endpoint, 500 error page + global `ErrorBoundary`, customer import duplicate-rule UI, `User.customRole` type.
  - Antigravity: exact EJS visual parity for **Leads** and **Clients** pages (KPI grids, view tabs, column visibility modal, advanced filters, pagination) + team CSV import/export/template + settings field reorder.
  - All verified: `npx tsc --noEmit` exit 0, `npm run build` exit 0, `node --check` on all api/*.js exit 0.
- **Companies, Integrations, and ConfirmDialog Parity (Antigravity, 2026-09-04):**
  - Section 5: Built full Company Detail page with 10-card metric KPI grid, pre-scoped inline Add Lead form, company attachments uploader and stored documents table (with download & delete), leads portfolio table, 5-pill workspace activity stream, assigned collaborators panel with quick add/remove, and marketing campaign performance breakdown. Added server endpoints for attachment upload, download, delete and collaborator management.
  - Section 6: Enhanced Integrations page with side-by-side instructional help panels for Meta Ads & GA4, setup checklists, live cURL and fetch code examples for Webhooks, and clear credentials actions.
  - Section 7: Built reusable `<ConfirmDialog>` component in `client/src/components/ConfirmDialog.tsx` and replaced native `window.confirm()` calls across all pages.
  - Section 8: Master Gap Report updated in `GAP_REPORT.md` with complete parity matrix and ownership breakdown.
  - Full verification: `npx tsc --noEmit` exit 0, `npm run build` exit 0, `node --check` exit 0.

## 2026-09-04 — User-authorized migration fixes
The owner requested Codex to fix the realstatusmigration.md findings across the historical domain boundaries. SEC-01: restored the EJS audit.view gate in the Audit API; six synthetic tests of the actual staged router passed (admin, manager, agent, client, granted custom role, hidden module). No database access or CRM data mutation. Other audit findings remain open.

SEC-02/03/04/10 permission gates: restored EJS view/action policies in six domain routers. 32 synthetic tests passed against actual staged routers. Credential projection, recipient scope and other associated sub-findings remain open.
SEC-09 and SEC-03 credential response protection: tested nested Mongoose/lean responses across four roles. API JSON omits password/reset material and encrypted credentials; API keys require integrations.update. Tests preserve IDs, Dates, JWT token fields and primitive values. Internal database/authentication queries and data are unchanged.
SEC-06: workspace access now revalidated per JWT request using current organization, active status and membership. Forged headers ignored; switch recovery remains available. Login/switch manager access aligned with existing /me policy; terminology projection restored. Six isolated middleware scenarios passed.
DATA-01 fixed: sparse imports retain omitted numbers, stage and existing fields; explicit zero works; Mongoose Map custom fields preserved. Import preview/execution apply submitted mappings and preview recognizes same-file duplicates. Actual handlers tested with synthetic documents and mocked persistence. Remaining import workflow/UI findings still open.
Work repair: four mutation parent/item lookups now enforce assigned scope. Invalid embedded populate removed; subtasks use CustomRecord.parentRecord with create permission, eligible owner/date checks, inherited customer, collaborator access, audit and notification. UI sends owner ID with correct input type. Status membership and terminal completion timestamp repaired. Isolated handler tests and full staged client TypeScript passed. General work field/reference validation remains open.
