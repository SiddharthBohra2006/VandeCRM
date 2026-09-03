# Antigravity Progress — VandeCRM React Migration

## Scope & Boundaries
- **Assigned domains:** Notifications, Companies, Campaigns, Work, Tasks, Team, Settings, Mail, Integrations, Audit, Search.
- **Strictly excluded (Codex ownership):** Dashboard (`server/src/api/dashboard.js`, `DashboardPage.tsx`) & Customers (`server/src/api/customers.js`, `CustomersPage.tsx`, `CustomerDetailPage.tsx`, `CustomerFormPage.tsx`).
- **Shared infrastructure (OpenCode ownership):** Auth middleware, core routing framework, server configuration.

## Operating Principles (Ponytail Senior Dev Mode)
- Reuse existing Mongoose models, services (`defaults.js`, `passwords.js`, `mailer.js`, `audit.js`), and helper utilities as-is without rewriting them.
- Single API response envelope `{ ok: true, data: ... }` / `{ ok: false, error: ... }`.
- Exact contract conformance per `API-CONTRACTS.md`.
- Pixel-parity and direct CSS reuse from original EJS views in `d:\VandeAgencyCRM\src\views\`.
- Incremental verification at every step.

---

## Active Status & Roadmap

| Domain | API Route (`server/src/api/`) | Client API (`client/src/api/`) | React Page (`client/src/pages/`) | Status |
|---|---|---|---|---|
| **Notifications** | `notifications.js` | `notifications.ts` | (TopBar bell integration) | 🟢 Complete (Verified) |
| **Companies** | `companies.js` | `companies.ts` | `companies/CompaniesPage.tsx`, `CompanyDetailPage.tsx` | 🟢 Complete (Verified) |
| **Campaigns** | `campaigns.js` | `campaigns.ts` | `campaigns/CampaignsPage.tsx`, `CampaignDetailPage.tsx` | 🟡 In Progress (Step 3) |
| **Work** | `work.js` | `work.ts` | `work/WorkCenterPage.tsx`, `WorkListPage.tsx`, `WorkDetailPage.tsx` | ⚪ Pending |
| **Tasks** | `tasks.js` | `tasks.ts` | `tasks/TasksPage.tsx` | ⚪ Pending |
| **Team** | `team.js` | `team.ts` | `team/TeamPage.tsx` | ⚪ Pending |
| **Settings** | `settings.js` | `settings.ts` | `settings/SettingsPage.tsx` | ⚪ Pending |
| **Mail** | `mail.js` | `mail.ts` | `mail/MailPage.tsx` | ⚪ Pending |
| **Integrations** | `integrations.js` | `integrations.ts` | `integrations/IntegrationsPage.tsx` | ⚪ Pending |
| **Audit** | `audit.js` | `audit.ts` | `audit/AuditPage.tsx` | ⚪ Pending |
| **Search** | `search.js` | `search.ts` | `search/SearchPage.tsx` | ⚪ Pending |

---

## Coordination Log
- Read and aligned with all architectural and contract documentation: `MIGRATION-ARCHITECTURE.md`, `API-CONTRACTS.md`, `REACT-PATTERNS.md`, `CODEX-PROGRESS.md`, `ANTIGRAVITY-TASKS.md`, `SYNC.md`, `OWNERSHIP.md`.
- **Step 1 (Notifications) Complete:**
  - Built `server/src/api/notifications.js` (`GET /feed`, `GET /`, `POST /:id/read`, `POST /read-all`) using `Notification` model with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/notifications.ts` API client.
  - Integrated notification bell dropdown, unread count polling, mark read, and dismiss actions into `client/src/components/TopBar.tsx`.
  - Verified `tsc --noEmit` and Vite production build (`npm run build` green).
- **Step 2 (Companies) Complete:**
  - Built `server/src/api/companies.js` (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `POST /switch`, `POST /:id/main`, `POST /:id/collaborators`, `POST /:id/api-key/regenerate`) using `ClientCompany`, `User`, `Campaign`, `Customer`, `Activity`, `Attachment` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/companies.ts` API client.
  - Built `client/src/pages/companies/CompaniesPage.tsx` and `CompanyDetailPage.tsx`.
  - Registered routes `/companies` and `/companies/:id` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Next:** Step 3 — Campaigns API (`campaigns.js`), client API (`campaigns.ts`), `CampaignsPage.tsx`, `CampaignDetailPage.tsx`.
