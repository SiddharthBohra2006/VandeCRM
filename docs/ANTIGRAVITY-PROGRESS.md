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
| **Notifications** | `notifications.js` | `notifications.ts` | (Context / Header integration) | 🟡 Ready to start (Step 1) |
| **Companies** | `companies.js` | `companies.ts` | `companies/CompaniesPage.tsx`, `CompanyDetailPage.tsx` | ⚪ Pending |
| **Campaigns** | `campaigns.js` | `campaigns.ts` | `campaigns/CampaignsPage.tsx`, `CampaignDetailPage.tsx` | ⚪ Pending |
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
- Read and aligned with all architectural and contract documentation: `MIGRATION-ARCHITECTURE.md`, `API-CONTRACTS.md`, `REACT-PATTERNS.md`, `CODEX-PROGRESS.md`, `ANTIGRAVITY-TASKS.md`.
- Confirmed CommonJS backend module conventions and typed Vite React patterns matching OpenCode and Codex conventions.
- Beginning execution following Priority Order in `ANTIGRAVITY-TASKS.md`.
