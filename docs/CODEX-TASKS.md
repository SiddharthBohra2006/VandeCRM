# CODEX TASKS — VandeCRM React Migration

You are one of three developers working on migrating VandeCRM from EJS to React. The other two developers are:
- **Opencode** (lead architect) — built the API layer, auth, and React shell
- **Antigravity** — building remaining pages

**Read these files first before starting any work:**
1. `D:\vandecrmreact\docs\MIGRATION-ARCHITECTURE.md` — the full architecture
2. `D:\vandecrmreact\docs\API-CONTRACTS.md` — exact JSON shapes for every endpoint
3. `D:\vandecrmreact\docs\REACT-PATTERNS.md` — exact component patterns to follow

**Your assignment: Build the Dashboard and Customers (Leads) API routes + React pages**

---

## Task 1: Dashboard API Route

**File:** `D:\vandecrmreact\server\src\api\dashboard.ts`

Create the API route that returns JSON for the dashboard. Reference the original EJS controller at `D:\VandeAgencyCRM\src\routes\dashboard.js` (lines 524-682 for the main `GET /` handler).

**Endpoints to implement:**
- `GET /api/dashboard` — Returns stats, stageCards, moduleStats, deadlines, weekly progress, recent customers, attention customers
- `POST /api/dashboard/preferences/sidebar` — Save sidebar preferences
- `POST /api/dashboard/preferences/dashboard` — Save dashboard card preferences
- `POST /api/dashboard/pipeline/move` — Drag-and-drop stage change

**Pattern to follow:** Copy the exact query logic from the EJS route but return JSON instead of `res.render()`. Use `requireApiAuth` middleware from `src/api/middleware/auth.ts`.

**Important:** The `req.activeCompanyId` is set by the auth middleware from the JWT token's activeCompanyId claim. Use it exactly like the EJS routes use `req.activeCompany._id`.

---

## Task 2: Customers API Route

**File:** `D:\vandecrmreact\server\src\api\customers.ts`

**Endpoints to implement:**
- `GET /api/customers` — List with filters (q, stage, label, campaign, sortBy, view, dateFrom, dateTo, page, pageSize)
- `GET /api/customers/:id` — Single customer with activities, attachments, related work
- `POST /api/customers` — Create customer
- `PUT /api/customers/:id` — Update customer
- `DELETE /api/customers/:id` — Delete customer
- `POST /api/customers/bulk` — Bulk actions (stage, transfer, priority, value, source, delete)
- `GET /api/customers/export/csv` — CSV export
- `POST /api/customers/import/preview` — Import preview
- `POST /api/customers/import` — Execute import

**Reference:** `D:\VandeAgencyCRM\src\routes\customers.js` — this is a 1500+ line file. Focus on the GET /, POST /, PUT /:id, DELETE /:id, and POST /bulk handlers first. The import/export can be added later if time is short.

**Key helper functions to copy:**
- `normalizePhone()` — from customers.js line 82
- `getScopedCustomerFilter()` — from customers.js line 298
- `isManagerOrAdmin()` — from customers.js line 288
- `validateLeadRelations()` — from customers.js line 366
- `pickSelectedIds()` — from customers.js line 307
- `mergePermittedCustomData()` — from customers.js line 482
- `permittedLeadFields()` — from customers.js line 478

---

## Task 3: Dashboard React Page

**File:** `D:\vandecrmreact\client\src\pages\dashboard\DashboardPage.tsx`

Build the dashboard page. Reference the EJS template at `D:\VandeAgencyCRM\src\views\dashboard\index.ejs`.

**Sections to implement (in order):**
1. Stats cards (totalLeads, totalClients, newThisWeek, followupsDue, etc.)
2. Pipeline stage cards (kanban-style columns)
3. Module stats (work type progress)
4. Upcoming deadlines
5. Weekly work progress chart (simple bar display)
6. Recent customers
7. Attention customers

**Key rules:**
- Use same CSS class names as the EJS template
- Fetch data from `GET /api/dashboard`
- Handle loading and error states
- Use `useAuth()` for crmTerms (leadSingular, leadPlural etc.)

---

## Task 4: Customers React Pages

**Files:**
- `D:\vandecrmreact\client\src\pages\customers\CustomersPage.tsx`
- `D:\vandecrmreact\client\src\pages\customers\CustomerDetailPage.tsx`
- `D:\vandecrmreact\client\src\pages\customers\CustomerFormPage.tsx`

**CustomersPage** — List view with:
- Filter bar (search, stage dropdown, label dropdown, campaign dropdown, sort, view tabs)
- Stats bar (totalLeads, newLeads, qualifiedLeads, hotLeads, overdueLeads)
- Customer table with columns matching EJS template
- Pagination
- Bulk selection checkboxes
- Bulk action dropdown

**CustomerDetailPage** — Detail view with:
- Customer info card
- Activity timeline
- Notes section
- Edit form (inline or modal)

**CustomerFormPage** — Create/edit form:
- All customer fields
- Custom fields
- Stage selector
- Assignee selector

**Reference EJS templates at:** `D:\VandeAgencyCRM\src\views\customers\index.ejs`, `show.ejs`, `form.ejs`

---

## Before You Start

1. Read all 3 docs files completely
2. Check what files already exist in `D:\vandecrmreact\` — do not overwrite them
3. If a file already exists, read it first and only modify/extend it
4. Run `npm install` in `D:\vandecrmreact\server` after creating new files
5. Test each endpoint with curl or the React app before moving to the next

## When You're Done

1. Update `D:\vandecrmreact\docs\CODEX-PROGRESS.md` with what you completed
2. List any issues, decisions, or deviations from the contracts
3. Note any API contract changes you had to make (update API-CONTRACTS.md too)
