# Gap Report: EJS CRM (`D:\VandeAgencyCRM`) → React CRM (`D:\vandecrmreact`)

This report is an actionable, page-by-page comparison. For every gap it gives the **original EJS file/line/class** and the **React counterpart file/line/class** so each item can be fixed directly. Gaps are ordered by severity (High → Low) within each section.

Legend of the two codebases:
- **EJS** = `D:\VandeAgencyCRM\src\views\...` — server-rendered templates w/ partials, helpers (`canPermission`, `crmTerms`), inline `<style>`.
- **React** = `D:\vandecrmreact\client\src\...` — TypeScript SPA, React Router, CSS variables (`.app.css` / `var(--gold)`, `var(--teal)`, etc.).

---

## 1. Page-by-Page Gaps

| Area | EJS source | React counterpart | Status / Gap |
|------|-----------|-------------------|--------------|
| Dashboard | `views/dashboard/index.ejs` (+`clientDashboard.ejs`, `reports-index.ejs`) | `pages/dashboard/DashboardPage.tsx` | Partial — greeting, dashboard view mode + card pinning missing (details in §4/§5) |
| Leads | `views/customers/index.ejs` | `pages/customers/CustomersPage.tsx` | Close match; CSV import present. Minor: `index.ejs` bulk layer + selection UX differs |
| Lead detail | `views/customers/detail.ejs` | `pages/customers/CustomerDetailPage.tsx` | Good coverage (overview/activity/work/files/details) — see §3/§4 for missing gadgets |
| Lead form | `views/customers/form.ejs` | `pages/customers/CustomerFormPage.tsx` | Close match |
| Duplicates | `views/customers/duplicates.ejs` | — **no route/page** | **MISSING** in React (see §1b) |
| CSV import preview | `customers/import.ejs`, `import-preview.ejs`, `import-results.ejs` | `CustomersPage.tsx` modals | Covered (single-page modals instead of 3 routes) |
| Clients | `customers/*` (client scope) | `pages/clients/ClientsPage.tsx` | Present |
| Work Center | `views/work/center.ejs` | `pages/work/WorkCenterPage.tsx` | Present |
| Work list | `views/work/index.ejs` (45 KB, **list/board/calendar**) | `pages/work/WorkListPage.tsx` | **Major gap** — React only has a table list; board (kanban + drag-drop) and calendar views are missing (§1c) |
| Work detail | `views/work/detail.ejs` + `_overview.ejs`, `_category-fields.ejs`, `_custom-fields.ejs` | `pages/work/WorkDetailPage.tsx` | Partial — sidebar summary/activity, secondary assignee, collaborators, links, parent/subtask tree missing (§3) |
| Work import | `views/work/import-preview.ejs` | — | **MISSING** import CSV in React work list |
| Tasks / follow-ups | `views/dashboard/reports-*` (client dashboard) | `pages/tasks/TasksPage.tsx` | Present (reschedule, complete, tabs) |
| Campaigns | `views/campaigns/index.ejs`, `show.ejs` | `pages/campaigns/CampaignsPage.tsx`, `CampaignDetailPage.tsx` | Present |
| Companies / CRMs | `views/companies/index.ejs`, `show.ejs` | `pages/companies/CompaniesPage.tsx`, `CompanyDetailPage.tsx` | Present |
| Portfolio | `views/dashboard/portfolio.ejs` | `pages/portfolio/PortfolioPage.tsx` | Present |
| Reports index | `views/dashboard/reports-index.ejs` | `pages/reports/ReportsIndexPage.tsx` | Present |
| Module report builder | `views/dashboard/module-report-builder.ejs` | `pages/reports/ModuleReportBuilderPage.tsx` | Present |
| Report table | `views/dashboard/report-table.ejs` | `pages/reports/ReportTablePage.tsx` | Present |
| Analytics | — | `pages/analytics/AnalyticsPage.tsx` | React-only (no exact EJS twin) |
| Mail | `views/mail/index.ejs` | `pages/mail/MailPage.tsx` | Present (3-pane grid) — see §4 |
| Integrations | `views/integrations/index.ejs` | `pages/integrations/IntegrationsPage.tsx` | Present |
| Search | `views/search/index.ejs` | `pages/search/SearchPage.tsx` | Present |
| Settings | `views/settings/index.ejs` (+`setup.ejs`, `_work-type-builder.ejs`) | `pages/settings/SettingsPage.tsx` | **Major gap** — categories `work-types` (Custom modules) and `automations` missing (§1d) |
| Team | `views/settings/index.ejs` (team panels) | `pages/team/TeamPage.tsx` | Present (members + roles tabs) |
| Audit | — | `pages/audit/AuditPage.tsx` | React-only |
| Auth | — | `pages/auth/*` (Login/Signup/Forgot/Reset) | React-only |
| Errors 403/404/500 | `views/errors/403.ejs`, `404.ejs`, `500.ejs` | — | **MISSING** dedicated error routes (React returns ad-hoc `Item not found` / `auth-error` blocks) |

### 1b. Missing pages in React (no route at all)
- **Lead duplicates page** — EJS `views/customers/duplicates.ejs` (merge/review duplicates). No React equivalent.
- **Work CSV import** — EJS `views/work/index.ejs` dialog `id="importWorkDialog"` + `views/work/import-preview.ejs`. React `WorkListPage.tsx` has no import.
- **Dedicated 403 / 404 / 500 pages** — EJS `views/errors/*.ejs`.

### 1c. Work list view modes (HIGH severity)
**EJS `views/work/index.ejs`** exposes three toggleable views via `presentation.enabledViews` (default `['list','board','calendar']`, line 22) and nav (lines 62–64):
- `list` view
- `board` view — line 113/120 `<section class="work-board" style="--work-columns: <%- statuses.length %>">`, per-status columns with `document.querySelectorAll('.work-edit-btn')` and HTML5 drag-and-drop listeners (lines 360–379) for reordering.
- `calendar` view — line 135 `<section class="work-calendar">`, month grid with `<div class="calendar-day <%= isToday ? 'today' : '' %>">` (line 146), `presentation.calendarField` (line 45).

**React `WorkListPage.tsx`** only renders a single table `section class="table-card"` (lines 329–393). There is **no** `view` toggle, **no** `work-board`, **no** `work-calendar`, and the only drag-and-drop in React is the pipeline board on the dashboard (`DashboardPage.tsx` `moveCustomer`, lines 89–102), not for work items. Configurable columns (`presentation.listColumns`, `presentation.boardFields`) are also unused.

### 1d. Settings categories missing (HIGH severity)
**EJS `views/settings/index.ejs`** admin category buttons (lines 24–27):
```ejs
<button type="button" data-settings-category="work-types">Custom modules</button>
<button type="button" data-settings-category="terminology">CRM names</button>
<button type="button" data-settings-category="automations">Automations</button>
<button type="button" data-settings-category="appearance">Look & feel</button>
```
(plus **stages**, **fields**, **labels** from the earlier panels.)

**React `SettingsPage.tsx`** category nav (lines 242–247) has only five:
```tsx
{ id: 'stages', ... }, { id: 'fields', ... }, { id: 'labels', ... },
{ id: 'terminology', ... }, { id: 'appearance', ... }
```
**Missing:**
- **Custom modules / work-types** — EJS `data-settings-panel="work-types"` (line 69) + dedicated `views/settings/_work-type-builder.ejs` (work-type CRUD with `statuses`, `fields`, presentation config: `enabledViews`/`listColumns`/`boardFields`/`calendarField`). The React `SettingsPage.tsx` declares `const [workTypes, setWorkTypes] = useState<any[]>([])` and loads `res.workTypes` (line 71) but **never renders a work-type editor**.
- **Automations** — EJS `data-settings-panel="automations"` (line 32): `Record automations` (trigger/action/condition, `assign_user`, `add_label`, `set_priority`, `create_record`, module automations with `set_status`/`set_field`) and rule list with Pause/Enable/Delete (line 66). No React equivalent at all.

---

## 2. Layout / Structural Gaps

| EJS partial | React file | Gap |
|-------------|-----------|-----|
| `views/partials/sidebar.ejs` (13 KB) | `components/Sidebar.tsx` | Close match on nav mod/structure. Minor: React `sidebar-footer` "Customize"/"Reset" buttons (Sidebar.tsx:185–192) are decorative with no corresponding theme/sidebar-order logic (EJS `sidebar.ejs` pinning). |
| `views/partials/topbar.ejs` (14 KB) | `components/TopBar.tsx` | React implements global search + notifications; see §3/§4 for missing alert count / real-time globals. |
| `views/partials/head.ejs` | `index.html` + `app.css` | Inline `<style>` blocks in EJS became CSS vars; verify exact palette parity. |
| `views/partials/header.ejs` | `layouts/AppLayout.tsx` | Structure aligns. |
| `views/partials/footer.ejs` | `layouts/AppLayout.tsx` | Aligns. |

Key structural finding: EJS is **one long server-rendered page** per area (e.g. `settings/index.ejs` is 1100+ lines and holds ALL tabs incl. team), while React splits into separate route components — this is fine, but it means **any tab/panel in the EJS mega-page that has no React screen = a dropped feature** (duplicates, automations, work-types editor).

---

## 3. Component-Level Gaps

### 3a. Work detail — right-hand summary / activity sidebar
**EJS `views/work/detail.ejs`** has an `<aside class="work-dialog-side">` (lines 189–213):
- **Task summary card** (`.summary-card-panel`, line 190): status badge, priority (`⚑ Important/Normal/Low`, line 193), deadline, `Created by` / `Created on` / `Last updated`.
- **Activity log card** (`.activity-card-panel`, line 204) with `.activity-timeline-feed` and `.timeline-feed-item`, showing `log.user?.name`, `log.message`, timestamp.

**React `WorkDetailPage.tsx`** has no `<aside>`; the audit log is rendered only `if (auditLog.length > 0)` (line 338) as a plain `.profile-panel`. It lacks the compact **Task summary** sidebar (created-by/created-on/updated fields) and the styled **activity timeline feed**.

### 3b. Work detail — assignment overview (owner / secondary / collaborators)
**EJS `detail.ejs` line 21** builds:
```js
const people = [ item.assignedTo && {person, role:'Owner'}, ...(item.collaborators||[]).map(...'Collaborator'), item.secondaryAssignee && {person,'Secondary assignee'} ];
```
and renders **Secondary assignee**, **Start date**, **Delivered date**, **Collaborators** (`.collaborator-pill-grid`, lines 74–78).

**React `WorkDetailPage.tsx`** edit form omits `secondaryAssignee` and `collaborators` (they aren't in `editForm`, lines 50–60) and its detail grid only shows Title / Client / Deadline / Delivered / Notes (lines 269–281) — **no collaborators, no secondary assignee, no start date** in the read-only view.

### 3c. Work detail — Files & Links + extra custom-field section
**EJS `detail.ejs`** renders dedicated `Files & Links` section (`.task-link-grid`, lines 173–178) for `url`-type fields and an **Additional Information** section (`.assignment-overview-grid`, lines 180–185) for remaining custom fields.

**React `WorkDetailPage.tsx`** never renders custom fields (`editForm.customFields` is loaded but not displayed; only `notes` shown). No links section.

### 3d. Subtask tree / parent-child tree in the work list
**EJS `work/index.ejs`** shows nested subtask rows under each item: `class="subtask-tree-row"` with `<details>` expandable `.subtask-tree-list` and per-subtask state/assignee/deadline (line 159), plus parent/filter logic `item.parentRecord` (line 47).

**React `WorkListPage.tsx`** is a flat table — no subtask tree rows, no parent-record nesting.

### 3e. Lead detail — avatar, tags, activities, attachments, links
**EJS `views/customers/detail.ejs`** (per prior analysis) has an avatar system, stage badge pill, tag/label chips, an activity timeline, attachments list, and linked work items.

**React `CustomerDetailPage.tsx`** covers most: avatar initials (line 73, `.lead-avatar`), stage badge pill (line 83, `.stage-badge-pill`), timeline (`.lead-timeline-item`, line 124), attachments (`.business-row`, line 128), related work (line 126). **Gaps:**
- Label/tag chips are only shown in the edit mode `check-grid` (line 110) — not rendered as read-only pills in overview.
- The editing UX is an inline form (`lead-tab-pane`), whereas EJS uses a modal/DNA-style panel; functional coverage is present but visual parity differs.

### 3f. Work type cards / sidebar module links
Both EJS sidebar and React `Sidebar.tsx` (lines 159–179) render per-module sub-links with icon maps. Parity here is good. The React icon map (line 161) matches EJS `moduleIcons` from `work/index.ejs` line 20 and `detail.ejs` line 24.

---

## 4. Styling Gaps

### 4a. Inline styles vs CSS-class component reuse (process gap)
The React codebase leans heavily on **inline `style={{...}}` objects** instead of the semantic EJS classes. Examples:
- `WorkCenterPage.tsx`, `WorkListPage.tsx`, `CampaignsPage.tsx`, `CampaignDetailPage.tsx`, `MailPage.tsx`, `IntegrationsPage.tsx`, `SearchPage.tsx`, `SettingsPage.tsx` all embed `style={{ ... }}` for nearly every layout box, while the EJS originals use reusable classes (`.work-card-panel`, `.panel-section-head`, `.section-icon`, `.assignment-overview-grid`, `.table-card`, `.filter-bar`, `.stats-grid`, `.metric`, `.profile-panel`, `.team-card`, `.check-pill`, `.stage-badge`, `.pill`).
- Concretely, EJS work detail uses `<section class="work-card-panel edit-card-section">` + `<header class="panel-section-head">` with `<span class="section-icon">` (detail.ejs:49–56, 65–72); React `WorkDetailPage.tsx` hand-rolls these as `<article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>` (lines 266, 285).

**Actionable:** The inline styles already consume the same CSS variables (`var(--panel)`, `var(--border)`, `var(--gold)`, `var(--teal)`, `var(--muted)`, `var(--bg-soft)`, `var(--red)`) so visual output is consistent; the gap is **maintainability / class reuse**, not color. Convert high-churn layouts (work detail, campaign detail, settings panels) to shared classes.

### 4b. Specifically-styled components not ported to React
- `.work-board`, `.work-calendar`, `.subtask-tree-row`/`.subtask-tree-list`, `.work-board-empty`, `.task-progress`, `.premium-subtask-list`, `.subtask-item-row`/`.subtask-check-circle` (EJS work) — **no React equivalents**.
- `.summary-card-panel`, `.activity-card-panel`, `.activity-timeline-feed`, `.timeline-feed-item`, `.collaborator-pill-grid` (EJS `detail.ejs`) — **no React equivalents**.
- `.automation-form`, `.module-card-list`/`.module-card` (EJS settings) — **no React equivalents**.
- `.work-type-builder` (EJS `_work-type-builder.ejs`) — **no React equivalent**.
- `.saved-report-links`, `.module-report-entry`, `.report-choice-grid`, `.report-metric-grid`, `.custom-report-addon` — these ARE present in React `ReportsIndexPage.tsx` (classes referenced, lines 88/97/110/122/134/145) so reports styling is largely ported.

---

## 5. Feature Gaps (functionality, not just markup)

### 5a. Dashboard — greeting, view modes, card pinning (HIGH)
**EJS `views/dashboard/index.ejs`** (per prior detailed analysis) includes:
- **Personalized greeting** for the logged-in user.
- **Dashboard view modes / card pinning** — user can pin/reorder dashboard cards, with per-user persistence.
- Module stats, stage counts, campaign-pipeline filter.

**React `DashboardPage.tsx`** has a fixed layout:
- No personalized day greeting (header is static `Workspace overview / Dashboard`, lines 124–126).
- `dashboard-metrics` (line 133) is a fixed 8-metric grid; no pinning/reordering.
- It DOES implement the campaign pipeline filter via `searchParams.get('campaign')` (lines 78–79, 186–193) and HTML5 drag-drop between stages (`moveCustomer`, lines 89–102) — good parity for those two specific features.

### 5b. Settings — Custom modules editor + Automations (HIGH — see §1d)
Entire **work-type builder** and **automations** subsystems are absent from React. Backend endpoints (`/settings/work-types`, `/settings/automations`, `/automations/:id/toggle`/`/delete`) exist in EJS but have no React UI.

### 5c. Work — board & calendar views (HIGH)
See §1c. These are the largest single-feature drop: **kanban board with drag-drop** and **month calendar** per work module.

### 5d. Work — subtask tree & parent/child records
EJS supports **parent records** (`item.parentRecord`) and renders a nested subtask tree in the list (line 159) plus a rich subtask composer (`subtask-composer-*`, detail.ejs:129–168) with **deadline and priority per subtask**. React `WorkDetailPage.tsx` subtask form only captures `title` + `assignedTo` (lines 71–76); no deadline/priority per subtask, and the list has no tree view.

### 5e. Work detail — developer fields (created by / created on / last updated) & activity feed
See §3a. EJS `detail.ejs` summary card exposes `Created by`, `Created on`, `Last updated` (lines 196–200) — absent in React.

### 5f. Duplicates management
EJS `customers/duplicates.ejs` — lead duplicate detection/review/merge. **Absent in React.**

### 5g. Work CSV import
EJS `work/index.ejs` dialog + `work/import-preview.ejs` — import work items from CSV, preview impact. **Absent in React** (lead CSV import exists in `CustomersPage.tsx`, but work import does not).

### 5h. Notifications / alerts in top bar
EJS `partials/topbar.ejs` (14 KB) carries global notification/alert surfaces with counts. React `SearchPage.tsx` shows an **Unread Alerts** stat (`data.stats.unreadMessages`, line 106) and the mail UI read state, but a dedicated topbar unread-alert pill with drill-down is not implemented in `TopBar.tsx` — verify and port if it exists in the EJS topbar.

### 5i. Confirmation UX (minor)
React relies on native `window.confirm`/`confirm(...)` for destructive actions (`CustomersPage.tsx:50`, `CustomerDetailPage.tsx:59`, `SettingsPage.tsx:117/156/187`, `CampaignDetailPage.tsx:139`, `WorkDetailPage.tsx:118`). EJS uses styled modal `<dialog>` elements (e.g. `#importWorkDialog`, `.simple-dialog`). This is a UX-consistency gap; not a functional one.

---

## Quick Fix Priority (most impactful first)
1. **Work board + calendar views** → port `work/index.ejs` view toggle, `.work-board` drag-drop, `.work-calendar` into `WorkListPage.tsx`.
2. **Settings: Custom modules (work-types) editor** → port `_work-type-builder.ejs` / `data-settings-panel="work-types"` into `SettingsPage.tsx` (state already loaded as `workTypes`).
3. **Settings: Automations** → port `data-settings-panel="automations"` (rule CRUD + toggle/delete).
4. **Work detail parity** → add summary sidebar (`Created by/on`, `Last updated`), activity timeline feed, secondary assignee, collaborators, start date, links + custom-field sections, per-subtask deadline/priority, subtask tree in list.
5. **Lead duplicates page** → port `customers/duplicates.ejs`.
6. **Work CSV import** → port `work/import-preview.ejs`.
7. **Dashboard** → add personalized greeting + card pinning/reordering.
8. **Semantic class consolidation** → replace inline `style={{...}}` with shared CSS classes for the most duplicated layouts.
9. **Error pages** → add dedicated 403/404/500 routes.
