# REACT-MIGRATION-GAP-AUDIT.md
Independent gap audit (Claude, 4 Sept 2026) — fresh read of both codebases, not a rubber-stamp of the bundled `GAP_REPORT.md`.

See the companion notes for full prose. **TL;DR / actionable summary by owner:**

## OpenCode's confirmed gaps (in priority order)
1. **3.1 Dashboard customize/pin dialog** — missing `#dashboardCustomizeDialog` (two-panel: Available/Pinned, drag-reorder, section toggles). Per-user persisted via `/preferences/dashboard` (`dashboardCardsCustomized`, `dashboardHiddenCards`, `dashboardCardOrder`). Needs new `POST /api/dashboard/preferences` endpoint.
2. **3.2 Dashboard "movement" grid + preview dialog** — `business-grid dashboard-movement-grid` card row (gated by perms: `businesses.view`/`ads.view`/work-module view) summing recent cross-module activity, clickable to `#movementPreviewDialog`.
3. **4.1 Sticky/frozen table scrolling** — EJS ships `public/js/table-scroll.js` (freeze first column + header). React `CustomersPage.tsx` has no sticky/frozen implementation. 🟡 likely.
4. **4.2 "Hot Lead" badge** — verify whether distinct tier from "High Potential"; port badge if so. 🟡 low priority.
5. **7.1 Shared `<ConfirmDialog>` component** — build once in `client/src/components/` (OpenCode shared-infra) styled like EJS `.simple-dialog`, then replace `window.confirm()` in: OpenCode pages (4): `CustomerDetailPage.tsx`×2, `CustomersPage.tsx`×1, `DuplicatesPage.tsx`×1; Antigravity pages (11) once component exists.

## Antigravity's confirmed gaps (for reference / coordination)
- **§5 Companies (highest-value gap in project):** `CompanyDetailPage.tsx` (451) vs `companies/show.ejs` (748) — six missing sections: 5.1 Company Attachments & Stored Documents, 5.2 Add-Lead-to-Company inline form, 5.3 Leads Portfolio table, 5.4 Filterable Activity Stream (All/Notes/Stages/Calls/Emails & Meetings), 5.5 Assigned Collaborators (API `POST /:id/collaborators` likely exists), 5.6 Campaign Performance section.
- **§6 Integrations:** missing inline "How to get credentials" help + "Setup Checklist" panels (content-port only).
- **§7.1 half:** replace `window.confirm()` in 11 Antigravity files once the shared component exists.

## Verified complete (do NOT re-task)
Work board+calendar+drag-drop, work detail subtask tree/deadlines, settings work-type builder + automations, lead duplicates merge, work CSV import, notifications bell, error pages 403/404, auth incl. both reset-password routes, Spotlight search modal (React improvement), 1:1 models/data layer.
