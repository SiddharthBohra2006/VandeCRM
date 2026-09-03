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
| **Campaigns** | `campaigns.js` | `campaigns.ts` | `campaigns/CampaignsPage.tsx`, `CampaignDetailPage.tsx` | 🟢 Complete (Verified) |
| **Work** | `work.js` | `work.ts` | `work/WorkCenterPage.tsx`, `WorkListPage.tsx`, `WorkDetailPage.tsx` | 🟢 Complete (Verified) |
| **Tasks** | `tasks.js` | `tasks.ts` | `tasks/TasksPage.tsx` | 🟢 Complete (Verified) |
| **Team** | `team.js` | `team.ts` | `team/TeamPage.tsx` | 🟢 Complete (Verified) |
| **Settings** | `settings.js` | `settings.ts` | `settings/SettingsPage.tsx` | 🟢 Complete (Verified) |
| **Mail** | `mail.js` | `mail.ts` | `mail/MailPage.tsx` | 🟡 In Progress (Step 8) |
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
- **Step 3 (Campaigns) Complete:**
  - Built `server/src/api/campaigns.js` (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `POST /:id/status`, `DELETE /:id`) using `Campaign`, `ClientCompany`, `Customer`, `CrmStage`, `User` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/campaigns.ts` API client.
  - Built `client/src/pages/campaigns/CampaignsPage.tsx` and `CampaignDetailPage.tsx`.
  - Registered routes `/campaigns` and `/campaigns/:id` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Step 4 (Work) Complete:**
  - Built `server/src/api/work.js` (`GET /`, `GET /:type`, `GET /:type/:id`, `POST /:type`, `PUT /:type/:id`, `POST /:type/:id/status`, `DELETE /:type/:id`, `POST /:type/:id/subtasks`) using `CustomRecord`, `WorkType`, `Customer`, `User`, `AuditLog` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/work.ts` API client.
  - Built `client/src/pages/work/WorkCenterPage.tsx`, `WorkListPage.tsx`, and `WorkDetailPage.tsx`.
  - Registered routes `/work`, `/work/:type`, and `/work/:type/:id` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Step 5 (Tasks / Follow-ups) Complete:**
  - Built `server/src/api/tasks.js` (`GET /`, `POST /:id/complete`, `POST /:id/reschedule`) using `Customer`, `Activity`, `Notification` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/tasks.ts` API client.
  - Built `client/src/pages/tasks/TasksPage.tsx` with stats, quick-views, inline complete/reschedule, and recent activity history.
  - Registered route `/tasks` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Step 6 (Team Management) Complete:**
  - Built `server/src/api/team.js` (`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `GET /roles`, `POST /roles`, `PUT /roles/:id`, `DELETE /roles/:id`) using `User`, `ClientCompany`, `CustomRole`, `WorkType`, `CustomField` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/team.ts` API client.
  - Built `client/src/pages/team/TeamPage.tsx` with members tab (stats, search, add/edit member modal) and custom roles matrix tab.
  - Registered route `/team` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Step 7 (Settings) Complete:**
  - Built `server/src/api/settings.js` (`GET /`, `POST /stages`, `PUT /stages/:id`, `DELETE /stages/:id`, `POST /stages/reorder`, `POST /fields`, `PUT /fields/:id`, `DELETE /fields/:id`, `POST /labels`, `DELETE /labels/:id`, `PUT /terminology`, `PUT /theme`) using `CrmStage`, `CrmLabel`, `CustomField`, `WorkType`, `Organization`, `ClientCompany`, `AutomationRule`, `Customer` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/settings.ts` API client.
  - Built `client/src/pages/settings/SettingsPage.tsx` with category tabs for pipeline stages, form fields, tags, CRM terminology, and look & feel themes.
  - Registered route `/settings` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Next:** Step 8 — Mail API (`mail.js`), client API (`mail.ts`), `MailPage.tsx`.
