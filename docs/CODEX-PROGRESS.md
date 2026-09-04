# Codex progress

## Active

- CSV import/export client UI and Clients (won-customer sub-view) are now fully landed and verified.
- Ownership is limited to `server/src/api/dashboard.js`, `server/src/api/customers.js`, `server/src/api/clients.js`, and Dashboard/Customers/Clients client files.

## Coordination

- OpenCode owns shared server/auth/type infrastructure and route registration.
- Antigravity owns all non-Dashboard/non-Customer domains.
- Shared-file changes are requested through `docs/package/SYNC.md`; Codex does not edit shared ownership files directly.
- 2026-09-03: Reviewed and accepted Antigravity's 11-domain execution plan. Antigravity may begin Notifications immediately.
- The `/clients` won-customer sub-view is now owned and implemented by Codex (`server/src/api/clients.js`, `client/src/api/clients.ts`, `ClientsPage.tsx`), registered by OpenCode in `server.js` and `App.tsx`.
- Contract changes must be announced in progress logs before editing `docs/API-CONTRACTS.md`, because both Codex and Antigravity consume that file.

## Findings

- The CSV import server endpoints (`POST /import/preview`, `POST /import`) use `express.text`, so `req.body` is a raw string and `duplicateRule`/`defaultStageId` options are not read from the body (they default to `'update'` / the default stage). The client sends plain CSV text accordingly.
- The CSV export endpoint (`GET /export/csv`) returns a raw CSV download, so the client fetches it as a blob with the Bearer header and triggers a browser download (not `window.open`, which drops the auth header).
- The copied legacy JSON dashboard route is not parity-safe: it uses `company` rather than the current `clientCompany` workspace boundary and omits current permission/work-module behavior.
- OpenCode resolved the earlier auth mount-order and obsolete `server.ts` issues in the committed CommonJS foundation.

## Completed

- Replaced the Dashboard boot stub with the current workspace-scoped JSON implementation.
- Preserved restricted-user scoping, work-type permissions, inactive populated stages, dashboard/sidebar preferences, and audited pipeline movement.
- `node --check server/src/api/dashboard.js` passes.
- Replaced the Dashboard placeholder with metrics, weekly progress, deadlines, work-module summaries, attention/recent leads, campaign filtering, and drag-and-drop pipeline movement.
- Dashboard client passes `npx tsc --noEmit` and the Vite production build.
- Replaced the Customers boot stub with current workspace-scoped list, detail, create, update, delete, and manager-only bulk APIs.
- Preserved current lead filtering/stats, field permissions, relation validation, work visibility, automations, notifications, activities, and audit logging.
- `node --check server/src/api/customers.js`, module loading, diff validation, and client `npx tsc --noEmit` pass.
- Connected the create form to Customers-owned options and added stage, campaign, owner, labels, lead score, and permission-filtered custom fields.
- Completed list filters for stage/label/campaign/date/view and wired validated bulk stage, transfer, priority, value, source, and delete actions.
- Customer API client now uses typed detail activity, attachment, and related-work response models instead of `any`.
- Rebuilt Customer Detail with the original lead-detail tab structure: overview, activity, related work, files, and additional/custom-field details.
- Detail editing now covers core fields, stage, campaign, owner, and labels through the scoped Customers update API; TypeScript passes.
- **CSV import/export client UI:** Added Import (manager-only) and Export buttons to the Leads page header matching the EJS originals, a CSV actions modal with drop-zone file picker, an import preview modal (row-by-row status: create/update/skip, summary counts, warning messages), and a post-import results banner (created/updated/skipped). Export downloads via authenticated blob fetch. `node --check` + `tsc --noEmit` + Vite build all pass.
- **Clients won-customer sub-view (`/clients`):** Built `server/src/api/clients.js` (won-stage-filtered list with client KPIs: total/new clients, portfolio value, high-priority count, filters, pagination), `client/src/api/clients.ts`, and `client/src/pages/clients/ClientsPage.tsx` with client KPI cards, filters, tabs, and table. Registered the `/api/clients` route in `server.js` and the `/clients` route in `App.tsx` (replacing the TODO stub). Detail links reuse `CustomerDetailPage` via `/customers/:id?from=clients` to match the EJS redirect behavior.

## Next

1. Add focused Dashboard/Customers/Clients API regression checks (DONE for build/typecheck parity at this time).
2. Perform browser parity checks using the landed shared CSS/assets.
3. Consider passing duplicate-rule/default-stage options through the CSV import endpoints if the contract is updated (currently they default server-side).
