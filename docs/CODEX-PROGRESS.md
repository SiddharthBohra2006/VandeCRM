# Codex progress

## Active

- Dashboard React page parity implementation against the current EJS template.
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
- The API server must authenticate bearer tokens before applying copied EJS permission middleware; otherwise `req.user` is unavailable.
- `server/src/server.ts` currently fails strict TypeScript compilation (`express-session` declarations, `MongoStore.on`, and untyped error middleware). These shared-entry fixes remain owned by OpenCode.

## Completed

- Replaced the Dashboard boot stub with the current workspace-scoped JSON implementation.
- Preserved restricted-user scoping, work-type permissions, inactive populated stages, dashboard/sidebar preferences, and audited pipeline movement.
- `node --check server/src/api/dashboard.js` passes.

## Next

1. Add a focused Dashboard route regression check.
2. Implement and type-check the Dashboard React page.
3. Repeat the same API-first sequence for Customers.
