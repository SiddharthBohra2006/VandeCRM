# Codex progress

## Active

- Customers React page parity and remaining CSV import/export API work.
- Ownership is limited to `server/src/api/dashboard.js`, `server/src/api/customers.js`, and Dashboard/Customers client files.

## Coordination

- OpenCode owns shared server/auth/type infrastructure and route registration.
- Antigravity owns all non-Dashboard/non-Customer domains.
- Shared-file changes are requested through `docs/package/SYNC.md`; Codex does not edit shared ownership files directly.
- 2026-09-03: Reviewed and accepted Antigravity's 11-domain execution plan. Antigravity may begin Notifications immediately.
- Shared intersections remain OpenCode-owned: Antigravity should implement notification state/API components in its domain, then request OpenCode to integrate them into `TopBar.tsx`, `App.tsx`, and `server/src/server.ts` rather than editing those shared files concurrently.
- Contract changes must be announced in progress logs before editing `docs/API-CONTRACTS.md`, because both Codex and Antigravity consume that file.

## Findings

- The copied legacy JSON dashboard route is not parity-safe: it uses `company` rather than the current `clientCompany` workspace boundary and omits current permission/work-module behavior.
- OpenCode resolved the earlier auth mount-order and obsolete `server.ts` issues in the committed CommonJS foundation.
- The React bundle currently contains only the small scaffold stylesheet; the original dashboard class rules remain in `D:\VandeAgencyCRM\public\css\app.css`. OpenCode should coordinate the shared CSS/assets copy before visual parity can be signed off.

## Completed

- Replaced the Dashboard boot stub with the current workspace-scoped JSON implementation.
- Preserved restricted-user scoping, work-type permissions, inactive populated stages, dashboard/sidebar preferences, and audited pipeline movement.
- `node --check server/src/api/dashboard.js` passes.
- Replaced the Dashboard placeholder with metrics, weekly progress, deadlines, work-module summaries, attention/recent leads, campaign filtering, and drag-and-drop pipeline movement.
- Dashboard client passes `npx tsc --noEmit` and the Vite production build.
- Replaced the Customers boot stub with current workspace-scoped list, detail, create, update, delete, and manager-only bulk APIs.
- Preserved current lead filtering/stats, field permissions, relation validation, work visibility, automations, notifications, activities, and audit logging.
- `node --check server/src/api/customers.js`, module loading, diff validation, and client `npx tsc --noEmit` pass.

## Next

1. Complete Customers list/detail/form page parity against the current EJS templates.
2. Add CSV preview/import/export without weakening the existing validation path.
3. Add focused Dashboard and Customers API regression checks.
4. Perform browser parity checks after OpenCode lands the shared CSS/assets.
