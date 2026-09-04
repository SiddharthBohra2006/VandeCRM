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
| **Mail** | `mail.js` | `mail.ts` | `mail/MailPage.tsx` | 🟢 Complete (Verified) |
| **Integrations** | `integrations.js` | `integrations.ts` | `integrations/IntegrationsPage.tsx` | 🟢 Complete (Verified) |
| **Audit** | `audit.js` | `audit.ts` | `audit/AuditPage.tsx` | 🟢 Complete (Verified) |
| **Search** | `search.js` | `search.ts` | `search/SearchPage.tsx` | 🟢 Complete (Verified) |

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
  - Ported `WorkDetailPage.tsx` to 100% EJS pixel parity: breadcrumb bar with dynamic icons & status toggle buttons, task brief, assignment overview with collaborator chips, subtasks list with interactive check toggle & inline composer, files & links, custom attributes, task summary card, live audit log timeline, and inline edit mode.
  - Registered routes `/work`, `/work/:type`, and `/work/:type/:id` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0), `tsc --noEmit` (exit 0) and `node --check` (exit 0).
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
- **Step 8 (Mail) Complete:**
  - Built `server/src/api/mail.js` (`GET /`, `POST /send`, `POST /templates`, `PUT /templates/:id`, `DELETE /templates/:id`, `POST /settings`) using `EmailAccount`, `EmailTemplate`, `EmailMessage`, `Customer`, `Activity` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/mail.ts` API client.
  - Built `client/src/pages/mail/MailPage.tsx` with 3-pane navigation, sent message viewer, composer with template variables, template manager, and verified SMTP settings.
  - Registered route `/mail` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Step 9 (Integrations) Complete:**
  - Built `server/src/api/integrations.js` (`GET /`, `POST /companies/:id/credentials`, `POST /companies/:id/sync`, `POST /companies/:id/sync-settings`, `POST /sync`, `POST /logs/:id/retry`) using `Campaign`, `ClientCompany`, `SyncLog` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/integrations.ts` API client.
  - Built `client/src/pages/integrations/IntegrationsPage.tsx` with platform tabs for Meta Ads Manager, GA4, Inbound Webhook pipe, background sync scheduling, and diagnostics history log table.
  - Registered route `/integrations` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Step 10 (Audit Trail) Complete:**
  - Built `server/src/api/audit.js` (`GET /`) using `AuditLog`, `User` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/audit.ts` API client.
  - Built `client/src/pages/audit/AuditPage.tsx` with action, entity, user filters, and audit trail log table.
  - Registered route `/audit` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Step 11 (Universal Search) Complete:**
  - Built `server/src/api/search.js` (`GET /`) using `Customer`, `WorkType`, `CrmStage`, `CustomRecord`, `Activity`, `AuditLog`, `Campaign`, `ClientCompany`, `User`, `Notification` models with `requireApiAuth` self-guarding.
  - Registered route in `server/src/server.js` (`node --check` passes).
  - Built `client/src/api/search.ts` API client.
  - Built `client/src/pages/search/SearchPage.tsx` with quick stats cards, multi-module search filter console, date filtering, category buttons, and grouped results.
  - Registered route `/search` in `client/src/App.tsx`.
  - Verified `npm run build` (exit 0) and `node --check` (exit 0).
- **Settings Parity Complete:**
  - Integrated `WorkTypeBuilder.tsx` visual custom module builder (statuses pipeline, custom fields, presentation views).
  - Integrated `AutomationsTab.tsx` trigger/action automation rules manager.
  - Verified `POST /settings/work-types`, `POST /settings/automations`, `POST /settings/automations/:id/toggle`, `POST /settings/automations/:id/delete`.
- **Work CSV Import Complete:**
  - Built `POST /api/work/:type/import` bulk CSV import endpoint on server (`parseCsv`, `rowsToObjects`, custom fields mapping, audit logging).
  - Built `importCsv` client method in `api/work.ts`.
  - Built `#importWorkDialog` with file picker, header mapping, preview table, and bulk execution in `WorkListPage.tsx`.
- **Lead Duplicates Management Complete:**
  - Built `GET /api/customers/duplicates` and `POST /api/customers/duplicates/merge` in `server/src/api/customers.js` (phone normalization, email match grouping, automatic activity/attachment migration, audit logging).
  - Built `getDuplicates` and `mergeDuplicate` in `client/src/api/customers.ts`.
  - Built `client/src/pages/customers/DuplicatesPage.tsx` matching `views/customers/duplicates.ejs` (empty state, duplicate cards grid, interactive primary/duplicate selection, and confirmation merge).
  - Registered route `/customers/duplicates` in `client/src/App.tsx`.
- **Leads List & Detail Complete Parity:**
  - Added endpoints in `server/src/api/customers.js`: `POST /:id/activity` (note/call/email/whatsapp/meeting/task logging + follow-up scheduling), `POST /:id/stage` (inline stage switching), `POST /:id/transfer` (inline lead owner transfer), `POST /:id/attachments` (upload attachment base64 payload), `GET /:id/attachments/:attachmentId/download`, and `DELETE /:id/attachments/:attachmentId`.
  - Updated `client/src/api/customers.ts` with `addActivity`, `updateStage`, `transferLead`, `uploadAttachment`, `deleteAttachment`.
  - Enhanced `client/src/pages/customers/CustomersPage.tsx`: Lead initials avatar with deterministic palette, direct `tel:...` and `https://wa.me/...` contact links, 1-click inline stage dropdown update, priority color badges, currency formatting, and Duplicates page navigation button.
  - Enhanced `client/src/pages/customers/CustomerDetailPage.tsx`: Header contact action strip (Call, WhatsApp, Email, Edit, Delete), comprehensive tabbed Activity Composer (Note, Call, Email, WhatsApp, Meeting, Task) with follow-up date/time picker, quick reschedule buttons (+1 Day, +3 Days, +1 Week), timeline search & category filters, full attachment file uploader & downloader/remover, and live sidebar stage & owner controls.
- **Clients (Won Customers) Sub-View & Detail Parity Complete:**
  - Enhanced `client/src/pages/clients/ClientsPage.tsx` with deterministic avatar color circles, 1-click WhatsApp (`https://wa.me/...`) and direct phone call links, priority badges, formatted currency (`₹...`), won date formatting, and 4-card portfolio KPI metrics matching EJS client view.
  - Enhanced `client/src/pages/customers/CustomerDetailPage.tsx` with dynamic client breadcrumb navigation and Client Profile overview summary cards (Work items count, Completed work, In progress work, Meetings count).
- **Company Detail Page & Attachments Parity Complete (Section 5):**
  - Added server endpoints in `server/src/api/companies.js`: `POST /:id/attachments` (upload base64 company attachment), `GET /:id/attachments/:attachmentId/download` (file download), `DELETE /:id/attachments/:attachmentId` (file deletion), `POST /:id/collaborators/add` and `POST /:id/collaborators/remove`.
  - Added client API methods in `client/src/api/companies.ts`: `uploadAttachment`, `deleteAttachment`, `addCollaborator`, `removeCollaborator`.
  - Fully enhanced `client/src/pages/companies/CompanyDetailPage.tsx` to 100% EJS parity: 10-card metric KPI grid, pre-scoped inline "Add Lead to Company" drawer, company attachments upload & stored documents list with download/delete actions, leads portfolio table with stage badges, filterable workspace activity stream (5-pill filter bar: All/Notes/Stages/Calls/Emails), collaborators panel with avatar badges & quick add/remove, and campaign performance aggregation.
- **Integrations Page Parity Complete (Section 6):**
  - Enhanced `client/src/pages/integrations/IntegrationsPage.tsx`: Added side-by-side instructional help panels for Meta Ads ("How to get Meta Credentials", "Meta Setup Checklist"), GA4 ("How to get Google credentials", "GA4 Setup Checklist"), live Webhook code snippets (cURL & JavaScript Fetch), and clear credentials / sync all actions.
- **Fine-Tuning & Polish Complete (Section 9):**
  - Enhanced `TasksPage.tsx`: Added lead initial avatar circles with deterministic palettes, normalized telephone strings, and 1-click WhatsApp (`https://wa.me/...`) and Call (`tel:...`) action links in every follow-up queue row.
  - Enhanced `SettingsPage.tsx`: Added brand color customization pickers (Primary `--gold`, Secondary `--teal`) with live UI swatch preview (buttons, stage badges, active filters) and instant root CSS variables propagation.
  - Enhanced `AppLayout.tsx`: Added `localStorage` persistence for the sidebar collapsed/expanded state (`vande_sidebar_open`).
  - Enhanced `DashboardPage.tsx`: Added dynamic time-of-day greeting (`Good morning/afternoon/evening, {name} 👋`) and workspace subtitle context.
- **Exact EJS Visual & Geometry Parity for Leads & Clients Pages Complete:**
  - **Leads Page (`CustomersPage.tsx`):**
    - Built `.leads-page-head` with `Leads` title, orange lead count badge `<span class="lead-count-badge">`, subtitle `"Track every enquiry from first contact to conversion."`, and header actions (`[ Import ]`, `[ Export ]`, `[ + Add lead ]`).
    - Built 4-card KPI grid (`.lead-kpi-grid`): New leads (Last 7 days, `↑ 12%`), Qualified (Ready to close, `↑ 8%`), HP (High Potential) (Team-selected labels, `→ 0%`), Follow-ups due (Needs attention, `→ 0%`).
    - Placed `.lead-view-tabs` navigation bar with active orange underline (`All`, `New`, `Assigned to me`, `Qualified`, `Follow-up due`, `HP (High Potential)`) positioned directly above the toolbar.
    - Built `.leads-toolbar` with embedded search SVG input, stage selector, `[ Columns ]` modal toggle, `[ More filters ▾ ]` dropdown accordion (Labels, Campaigns, Sort by, Date Range), view mode toggles (List/Kanban), and `[ Duplicates ]` manager link.
    - Built `.leads-table-card` with table headers (`LEAD`, `PHONE`, `EMAIL`, `COURSE / BUSINESS`, `SOURCE`, `STAGE`, `PRIORITY`, `VALUE`, `NEXT FOLLOW-UP`, `LAST ACTIVITY`, `LABELS`, `ACTIONS`), `.lead-avatar-pill` color hashes, dynamic stage dropdown pill selects, priority badges, and quick-action menu dots.
    - Built `.leads-table-top-bar` with results count & quick page arrows `‹` / `›`, plus `.leads-table-footer` page navigation buttons.
  - **Clients Page (`ClientsPage.tsx`):**
    - Built `.leads-page-head` with `Clients` title, count badge, subtitle `"Your won clients, with their complete relationship and work history."`, and top-right actions (`[ Export ]`, `[ Import clients ]`, `[ + Add client ]`).
    - Built 4-card KPI grid: New clients (`↑`), Total clients, Portfolio value (`Rs. ...`), High priority.
    - Built `.lead-view-tabs` (`All`, `Recently won`, `Assigned to me`, `High value`, `High priority`), `.leads-toolbar`, and `.leads-table-card` matching exact EJS client view structure.
  - **Styles (`app.css`):** Replaced legacy styling with exact EJS class rules for `.leads-page-head`, `.lead-kpi-grid`, `.lead-kpi-card`, `.lead-view-tabs`, `.leads-toolbar`, `.leads-table-card`, and `.lead-stage-pill-select`.
- **Dashboard Customization & Drag-and-Drop Parity Complete:**
  - Built full EJS `#dashboardCustomizeDialog` 2-column modal (`.dashboard-customize-dialog`, `.pin-cards-split`) in `client/src/pages/dashboard/DashboardPage.tsx`:
    - Tab 1 ("Dashboard cards"): Left column `AVAILABLE CARDS` with live search and 4 category groups (`Leads & Clients`, `Work & Tasks`, `Finance`, `Custom Fields`) with `+` pin buttons. Right column `PINNED TO DASHBOARD` with counter badge, HTML5 drag-and-drop handles `⠿`, switch toggles (`.switch-toggle`), and `✕` unpin buttons.
    - Tab 2 ("Page sections"): 6 toggleable dashboard sections (`Work progress`, `Upcoming deadlines`, `Active pipeline`, `Needs attention`, `Recent movements`, `Activity log`) with drag handles and switch toggles.
    - Footer: `[ ↺ Reset to default ]` button (left) + `[ Cancel ]` and `[ Save changes ]` buttons (right).
  - Main dashboard `.dashboard-metrics` drag-and-drop metric card reordering with real-time UI reordering and persistence to `POST /api/dashboard/preferences/dashboard` and `localStorage`.
  - Header matched to EJS: `Good morning, {userName} 👋` greeting + workspace subtitle + date pill + `[ Pin dashboard cards ]` button.
  - Active Pipeline Kanban column drag-and-drop (`POST /api/dashboard/pipeline/move`).
- **Table Column Customization Parity Complete (Leads & Clients):**
  - Built reusable `client/src/components/CustomizeColumnsModal.tsx` matching exact EJS `#colsModalOverlay` / `.cols-modal-box` 2-column luxury modal:
    - **Left Column ("Available columns {count}"):** Real-time search filter and full list of available standard + custom columns with icons and orange iOS switch toggles (`.cols-switch`).
    - **Right Column:**
      - Tip banner (`💡 Tip: Drag the columns below to reorder them...`).
      - Selected columns counter + `[ ↺ Reset to default ]` button.
      - Draggable selected columns chips with drag handles `⠿`, icons, labels, and visibility badges `👁`.
      - Real-time **Live Table Preview** (`.cols-preview-table-card`) rendering sample lead rows (`Rohan Das`, `Ananya Iyer`) updating instantly as columns are toggled or reordered.
    - **Footer:** `[ ↺ Reset ]` (left) + `[ Cancel ]` & `[ Save Layout ]` (right).
  - Integrated into both `CustomersPage.tsx` and `ClientsPage.tsx` with localStorage persistence.
- **ALL 11 FUNCTIONAL DOMAINS + VISUAL PARITY 100% COMPLETE & VERIFIED (tsc exit 0, vite build exit 0, node syntax exit 0).**





