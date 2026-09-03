# ANTIGRAVITY TASKS — VandeCRM React Migration

You are one of three developers working on migrating VandeCRM from EJS to React. The other two developers are:
- **Opencode** (lead architect) — built the API layer, auth, and React shell
- **Codex** — building Dashboard and Customers pages

**Read these files first before starting any work:**
1. `D:\vandecrmreact\docs\MIGRATION-ARCHITECTURE.md` — the full architecture
2. `D:\vandecrmreact\docs\API-CONTRACTS.md` — exact JSON shapes for every endpoint
3. `D:\vandecrmreact\docs\REACT-PATTERNS.md` — exact component patterns to follow

**Your assignment: Build the remaining API routes + React pages (Campaigns, Work, Team, Settings, Companies, Tasks, Mail, Notifications, Integrations, Audit, Search)**

---

## API Routes to Build

All API route files go in `D:\vandecrmreact\server\src\api\`

For each route, reference the original EJS controller in `D:\VandeAgencyCRM\src\routes\` and convert the logic to return JSON.

### 1. Campaigns API — `campaigns.ts`
Reference: `D:\VandeAgencyCRM\src\routes\campaigns.js`
- `GET /api/campaigns` — List with metrics (lead count, pipeline value, won revenue per campaign)
- `GET /api/campaigns/:id` — Single campaign with customers and metrics
- `POST /api/campaigns` — Create
- `PUT /api/campaigns/:id` — Update
- `POST /api/campaigns/:id/status` — Change status
- `DELETE /api/campaigns/:id` — Delete (check no linked customers)

### 2. Work API — `work.ts`
Reference: `D:\VandeAgencyCRM\src\routes\work.js`
- `GET /api/work` — Work center (all work types, items, counts)
- `GET /api/work/:type` — List items for a work type
- `GET /api/work/:type/:id` — Single item with subtasks and audit log
- `POST /api/work/:type` — Create item
- `PUT /api/work/:type/:id` — Update item
- `POST /api/work/:type/:id/status` — Quick status update
- `DELETE /api/work/:type/:id` — Delete (check no subtasks)
- `POST /api/work/:type/:id/subtasks` — Create subtask

**Important:** The `:type` param is the work type key (e.g., "video", "design", "task"). You need to look up the WorkType by key and check permissions.

### 3. Team API — `team.ts`
Reference: `D:\VandeAgencyCRM\src\routes\team.js`
- `GET /api/team` — List users with filters
- `POST /api/team` — Create user
- `POST /api/team/:id` — Update user
- `POST /api/team/:id/status` — Toggle active
- `POST /api/team/roles/create` — Create custom role
- `POST /api/team/roles/:id` — Update custom role
- `POST /api/team/roles/:id/delete` — Delete custom role

### 4. Settings API — `settings.ts`
Reference: `D:\VandeAgencyCRM\src\routes\settings.js`
- `GET /api/settings` — All settings data
- `POST /api/settings/stages` — Create stage
- `POST /api/settings/stages/:id` — Update stage
- `POST /api/settings/stages/reorder` — Reorder stages
- `POST /api/settings/labels` — Create label
- `POST /api/settings/labels/:id` — Update label
- `POST /api/settings/fields` — Create custom field
- `POST /api/settings/fields/:id` — Update custom field
- `POST /api/settings/fields/reorder` — Reorder fields
- `POST /api/settings/terminology` — Update terminology
- `POST /api/settings/theme` — Update theme
- `POST /api/settings/work-types` — Create work type
- `POST /api/settings/work-types/:id` — Update work type
- `DELETE /api/settings/work-types/:id` — Delete work type
- `POST /api/settings/automations` — Create automation
- `POST /api/settings/automations/:id/toggle` — Toggle automation
- `DELETE /api/settings/automations/:id` — Delete automation

### 5. Companies API — `companies.ts`
Reference: `D:\VandeAgencyCRM\src\routes\companies.js`
- `GET /api/companies` — List companies with lead/campaign counts
- `GET /api/companies/:id` — Single company with customers, campaigns, activities
- `POST /api/companies` — Create company
- `PUT /api/companies/:id` — Update company
- `POST /api/companies/switch` — Switch active workspace
- `POST /api/companies/:id/main` — Set as main
- `POST /api/companies/:id/collaborators` — Replace collaborators
- `POST /api/companies/:id/collaborators/add` — Add collaborator
- `POST /api/companies/:id/collaborators/remove` — Remove collaborator
- `POST /api/companies/:id/tracking` — Update tracking codes

### 6. Tasks API — `tasks.ts`
Reference: `D:\VandeAgencyCRM\src\routes\tasks.js`
- `GET /api/tasks` — Follow-up tasks list (filter: due/today/upcoming/all)
- `POST /api/tasks/:id/complete` — Mark complete
- `POST /api/tasks/:id/reschedule` — Reschedule

### 7. Mail API — `mail.ts`
Reference: `D:\VandeAgencyCRM\src\routes\mail.js`
- `GET /api/mail` — Mail center data
- `POST /api/mail/settings` — Save SMTP settings
- `POST /api/mail/templates` — Create template
- `POST /api/mail/templates/:id` — Update/delete template
- `POST /api/mail/send` — Send email

### 8. Notifications API — `notifications.ts`
Reference: `D:\VandeAgencyCRM\src\routes\notifications.js`
- `GET /api/notifications/feed` — Unread count
- `POST /api/notifications/:id/read` — Mark read
- `POST /api/notifications/read-all` — Mark all read

### 9. Integrations API — `integrations.ts`
Reference: `D:\VandeAgencyCRM\src\routes\integrations.js`
- `GET /api/integrations` — Overview with sync logs
- `POST /api/integrations/companies/:id/credentials` — Save credentials
- `POST /api/integrations/sync` — Trigger sync
- `POST /api/integrations/companies/:id/sync-now` — Sync single company
- `POST /api/integrations/companies/:id/api-key/status` — Toggle API key
- `POST /api/integrations/companies/:id/api-key/rotate` — Rotate API key

### 10. Audit API — `audit.ts`
Reference: `D:\VandeAgencyCRM\src\routes\audit.js`
- `GET /api/audit` — Audit trail with filters (action, entityType, user)

### 11. Search API — `search.ts`
Reference: `D:\VandeAgencyCRM\src\routes\search.js`
- `GET /api/search` — Global search across all entities

---

## React Pages to Build

All React pages go in `D:\vandecrmreact\client\src\pages\`

### Campaigns
- `campaigns/CampaignsPage.tsx` — List with metrics cards
- `campaigns/CampaignDetailPage.tsx` — Detail with customer list

### Work
- `work/WorkCenterPage.tsx` — Work type overview
- `work/WorkListPage.tsx` — List/board/calendar for a work type
- `work/WorkDetailPage.tsx` — Single work item with subtasks

### Team
- `team/TeamPage.tsx` — User list with role management

### Settings
- `settings/SettingsPage.tsx` — Tabbed settings (stages, labels, fields, terminology, theme, automations, work types)

### Companies
- `companies/CompaniesPage.tsx` — Company list
- `companies/CompanyDetailPage.tsx` — Company detail with metrics

### Tasks
- `tasks/TasksPage.tsx` — Follow-up task list

### Mail
- `mail/MailPage.tsx` — Mail center

### Integrations
- `integrations/IntegrationsPage.tsx` — Integration setup and sync

### Audit
- `audit/AuditPage.tsx` — Audit trail table

### Search
- `search/SearchPage.tsx` — Global search results

---

## Priority Order (build in this sequence)

1. **Notifications API** (simplest, 3 endpoints) + NotificationContext for the app
2. **Companies API** + CompaniesPage
3. **Campaigns API** + CampaignsPage + CampaignDetailPage
4. **Work API** + WorkCenterPage + WorkListPage + WorkDetailPage
5. **Tasks API** + TasksPage
6. **Team API** + TeamPage
7. **Settings API** + SettingsPage
8. **Mail API** + MailPage
9. **Integrations API** + IntegrationsPage
10. **Audit API** + AuditPage
11. **Search API** + SearchPage

---

## Rules

1. Read the docs files before starting — do not guess
2. Every API route uses `requireApiAuth` middleware
3. Every API response uses `{ ok: true, data: ... }` envelope
4. Every React page handles loading, error, and empty states
5. Copy CSS class names from EJS templates exactly
6. If you find a contract mismatch, update `API-CONTRACTS.md` and notify Opencode
7. Do not modify files in `models/`, `services/`, `utils/`, `config/`, `middleware/`
8. Do not overwrite files already created by other developers

## When You're Done

1. Update `D:\vandecrmreact\docs\ANTIGRAVITY-PROGRESS.md` with what you completed
2. List any issues, decisions, or deviations
3. Note any API contract changes
