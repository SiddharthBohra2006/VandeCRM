# Master Gap & Parity Report: EJS CRM (`D:\VandeAgencyCRM`) → React CRM (`D:\vandecrmreact`)

**Updated:** 4 Sept 2026  
**Auditors:** Antigravity & OpenCode  
**Scope:** Exhaustive side-by-side feature, UI, and styling comparison across all pages and components.

---

## 1. Executive Summary & Current Health

- **Build Health:** `npx tsc --noEmit` → **0 errors (Exit 0)** | `npm run build` → **Production bundle built cleanly (Exit 0)** | Server syntax → **Clean (Exit 0)**.
- **Visual Parity:** App design system (`app.css`, `auth.css`, `lead-detail.css`, `search.css`) active with theme variables (`--gold`, `--teal`, `--panel`, `--bg`, `--text`) dynamically applied on `<html>`.
- **All 11 Domain Packages:** Notifications, Companies, Campaigns, Work, Tasks, Team, Settings, Mail, Integrations, Audit, Search, and Clients are **100% ported and functional**.
- **Universal Modals:** Destructive actions across all domains use the accessible, themed `<ConfirmDialog>` instead of browser-native alerts.

---

## 2. Page-by-Page Status Matrix

| Domain / Page | Original EJS Source | React Implementation | Parity Status & Features |
|---|---|---|---|
| **App Shell & Layout** | `views/partials/sidebar.ejs`, `topbar.ejs`, `head.ejs`, `footer.ejs` | `layouts/AppLayout.tsx`, `components/Sidebar.tsx`, `components/TopBar.tsx`, `components/SearchModal.tsx` | **100% Complete** — Dynamic active company switcher, Spotlight Search (`Ctrl/Cmd+K` + popup modal with category tabs & recent searches), Notification Bell dropdown with mark-all-read & real-time badge, hover-expandable sidebar navigation. |
| **Dashboard** | `views/dashboard/index.ejs` (+ `clientDashboard.ejs`) | `pages/dashboard/DashboardPage.tsx` | **100% Complete** — Metric KPI grid with palette icons (`getCardTheme`), #dashboardCustomizeDialog modal (drag-drop card order, available/pinned toggle, section switcher), Recent Movements activity feed (all/work/leads/campaigns filters + sample preview dialog), Weekly Work Progress bar chart with day items, and Kanban pipeline drag-and-drop. |
| **Leads / Customers** | `views/customers/index.ejs` | `pages/customers/CustomersPage.tsx` | **100% Complete** — Avatar pills with deterministic colors, 1-click WhatsApp (`wa.me`) & Call (`tel:`) buttons, stage filter pills with count badges, inline stage dropdowns, results summary top bar with quick page arrows (`‹` / `›`), CSV import impact preview modal, bulk actions with `<ConfirmDialog>`. |
| **Lead Detail** | `views/customers/detail.ejs` | `pages/customers/CustomerDetailPage.tsx` | **100% Complete** — Header contact action strip, Tabbed Quick Activity Composer (Log Call, WhatsApp, Add Note), fast reschedule (+1d, +3d, +1w), multi-file attachments manager (upload/download/delete), live right-hand stage/owner/priority controls with `<ConfirmDialog>`. |
| **Lead Duplicates** | `views/customers/duplicates.ejs` | `pages/customers/DuplicatesPage.tsx` | **100% Complete** — Duplicate cluster grouping (phone/email/name), side-by-side field comparison, interactive merge with master record selection and `<ConfirmDialog>`. |
| **Clients (Won View)** | `views/customers/index.ejs` (`isClientView`) | `pages/clients/ClientsPage.tsx` | **100% Complete** — 4-card portfolio summary KPI strip, won-deal value indicators (₹), active project counters, account manager chips, last interaction timestamps. |
| **Work Center** | `views/work/center.ejs` | `pages/work/WorkCenterPage.tsx` | **100% Complete** — Module overview cards, overdue alerts, recent deliverables, quick module navigation. |
| **Work List** | `views/work/index.ejs` | `pages/work/WorkListPage.tsx` | **100% Complete** — View switcher (**List view** with expandable subtask tree, **Board view** with HTML5 drag-and-drop status kanban columns, **Calendar view** with month grid & day buckets), CSV bulk import modal with preview table. |
| **Work Detail** | `views/work/detail.ejs` + partials | `pages/work/WorkDetailPage.tsx` | **100% Complete** — Task brief header, breadcrumbs, Assignment Overview (Owner, Secondary Assignee, Collaborators, Start date, Delivered date), Subtask composer with per-subtask Deadline/Priority/Assignee, dynamic Custom Fields & Links section, Summary sidebar (Created by/on, Updated), Activity timeline feed, `<ConfirmDialog>`. |
| **Tasks / Follow-ups** | `views/tasks/index.ejs` | `pages/tasks/TasksPage.tsx` | **100% Complete** — Tabs (Due, Today, Upcoming, All), inline completion notes, inline fast reschedule with datetime picker. |
| **Companies** | `views/companies/index.ejs`, `show.ejs` | `pages/companies/CompaniesPage.tsx`, `CompanyDetailPage.tsx` | **100% Complete** — 10-card KPI metric grid, pre-scoped inline Add Lead form drawer, company attachments upload & stored documents table (download/delete), leads portfolio table, 5-pill workspace activity stream, assigned collaborators panel (add/remove), marketing campaign breakdown, `<ConfirmDialog>`. |
| **Campaigns** | `views/campaigns/index.ejs`, `show.ejs` | `pages/campaigns/CampaignsPage.tsx`, `CampaignDetailPage.tsx` | **100% Complete** — Spend, leads, CPR, conversion metrics, live status toggle, lead attribution table, campaign editor, `<ConfirmDialog>`. |
| **Settings** | `views/settings/index.ejs`, `_work-type-builder.ejs`, `setup.ejs` | `pages/settings/SettingsPage.tsx`, `WorkTypeBuilder.tsx`, `AutomationsTab.tsx` | **100% Complete** — All 7 settings panels: Stages, Custom Fields, Labels, Terminology, Look & Feel (theme presets & custom colors), **Custom Modules Builder** (fields, statuses, views configuration), and **Automations Engine** (trigger/condition/action rule builder), `<ConfirmDialog>`. |
| **Team** | `views/settings/index.ejs` (team panels) | `pages/team/TeamPage.tsx` | **100% Complete** — Members management, role permissions matrix, invitations, `<ConfirmDialog>`. |
| **Mail** | `views/mail/index.ejs` | `pages/mail/MailPage.tsx` | **100% Complete** — 3-pane email composer, merge tags, template manager, SMTP credential testing, `<ConfirmDialog>`. |
| **Integrations** | `views/integrations/index.ejs` | `pages/integrations/IntegrationsPage.tsx` | **100% Complete** — Meta Ads & GA4 step-by-step instructions & checklists, Webhook pipe with real-time cURL and JavaScript `fetch` code generation, sync scheduler, `<ConfirmDialog>`. |
| **Search** | `views/search/index.ejs` | `pages/search/SearchPage.tsx`, `components/SearchModal.tsx` | **100% Complete** — Deep search page with filters + Global Spotlight Search modal (`Ctrl/Cmd+K`). |
| **Reports & Analytics**| `views/dashboard/reports-*` | `pages/reports/*`, `pages/analytics/AnalyticsPage.tsx`, `pages/portfolio/PortfolioPage.tsx` | **100% Complete** — Reports index, module report builder, tabular reports, chart analytics. |
| **Auth & Errors** | `views/auth/*`, `views/errors/*` | `pages/auth/*`, `pages/errors/ForbiddenPage.tsx`, `NotFoundPage.tsx` | **100% Complete** — Login, Signup, Forgot Password, Reset Password, 403 Forbidden, 404 Catch-All. |

---

## 3. Work Division & Ownership Boundaries

To ensure rapid progress without conflicts, work is partitioned by ownership:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             OWNERSHIP MATRIX                                │
├──────────────────────────────────────┬──────────────────────────────────────┤
│       OPENCODE (Lead Architect)      │       ANTIGRAVITY (Domain Dev)       │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Auth API & Middlewares (JWT/roles) │ • Companies & Company Detail         │
│ • Server Entry & Route Registrations │ • Campaigns & Campaign Analytics     │
│ • Client Core Infrastructure         │ • Work (Center, List, Detail, Views) │
│ • App Shell (AppLayout, TopBar)      │ • Tasks & Follow-ups Center          │
│ • Dashboard (Page, Customizer, Stats)│ • Team & Permissions Matrix          │
│ • Customers / Leads & Duplicates     │ • Settings (Work Types & Automations)│
│ • Master Coordination Docs           │ • Mail, Integrations, Audit, Search  │
│                                      │ • Clients (Won-Customer Sub-view)    │
│                                      │ • Universal Accessible Modals        │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 4. Fine-Tuning & Polish Checklist

Both teams have completed the primary porting goals. Remaining work is purely optional micro-polish:

### OpenCode Polish Queue
1. **Dynamic Greeting Subtitle (`DashboardPage.tsx`):** Add time-of-day greeting (`Good morning/afternoon, {user.name} 👋`, `Here's your {role} workspace in {activeCompany}`).
2. **Sidebar State Persistence (`Sidebar.tsx`):** Cache collapsed/expanded preference in `localStorage`.
3. **Lead Table Sticky Headers (`CustomersPage.tsx`):** Enable frozen first column on mobile scroll.

### Antigravity Polish Queue
1. **Live Theme Palette Swatches (`SettingsPage.tsx`):** Add interactive color pill previews under Look & Feel.
2. **Task Center Quick Action Links (`TasksPage.tsx`):** Direct WhatsApp and Call buttons inside follow-up task rows.
3. **Verify Edge Case API Error Boundaries:** Ensure network errors trigger clean banner notices across all 11 sub-domains.

---

## 5. Verification Protocol

Every change must pass this strict verification pipeline:
1. `cd client && npx tsc --noEmit` → Must exit 0.
2. `cd client && npm run build` → Must exit 0.
3. `node --check server/src/api/*.js` → Must exit 0.
4. Clean git working tree with descriptive semantic commit messages.
