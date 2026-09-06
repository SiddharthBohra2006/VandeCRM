# Master Gap & Parity Report: EJS CRM (`D:\VandeAgencyCRM`) → React CRM (`D:\vandecrmreact`)

**Updated:** 6 Sept 2026 (fourth independent audit)
**Auditors:** Antigravity & OpenCode (original build) · OpenCode (independent re-audit)
**Scope:** Exhaustive side-by-side feature, UI, and styling comparison across all pages and components.

---

## 1. Executive Summary & Current Health

- **Build Health (re-verified 6 Sept 2026):** `npx tsc --noEmit` → **0 errors (Exit 0)** | `npm run build` → **Production bundle built cleanly (Exit 0)** | `node --check` across all 76 server files → **0 failures (Exit 0)** | Full server boot → JWT guard passes, connects to MongoDB, and listens successfully.
- **Visual Parity:** App design system (`app.css`, `auth.css`, `lead-detail.css`, `search.css`) active with theme variables (`--gold`, `--teal`, `--panel`, `--bg`, `--text`) dynamically applied on `<html>`.
- **Trustworthiness Note:** An independent re-audit (5 Sept 2026) found this report's earlier "100% Complete" claims were **not uniformly reliable** — a large parallel implementation existed but was **dead code**, and at least one specific parity claim was false in the shipping code. Those issues have been **fixed** (see §4b) and are now verifiable against the source.

---

## 2. Page-by-Page Status Matrix

| Domain / Page | React Implementation | Status |
|---|---|---|
| **App Shell & Layout** | `layouts/AppLayout.tsx`, `components/Sidebar.tsx`, `components/TopBar.tsx`, `components/SearchModal.tsx` | **Complete** — Dynamic workspace switcher, Spotlight Search (`Ctrl/Cmd+K`), Notification Bell with read badge, hover-expandable sidebar. |
| **Dashboard** | `pages/dashboard/DashboardPage.tsx` | **Complete** — Metric KPI grid, dashboard customizer (drag-drop card order, pinned/available), Recent Movements feed, weekly work progress, pipeline Kanban. |
| **Leads / Customers** | `pages/customers/CustomersPage.tsx` | **Complete** — Avatar pills, 1-click WhatsApp/Call, stage filter pills, inline stage dropdowns, CSV import impact preview, bulk actions. |
| **Lead Detail** | `pages/customers/CustomerDetailPage.tsx` | **Complete** — Action strip, Quick Activity Composer, fast reschedule (+1d/+3d/+1w), attachments, live stage/owner/priority controls. |
| **Lead Duplicates** | `pages/customers/DuplicatesPage.tsx` | **Complete** — Cluster grouping by phone/email/name (name matching now shipped), side-by-side comparison, interactive merge. |
| **Clients (Won View)** | `pages/clients/ClientsPage.tsx` | **Complete** — Portfolio KPI strip, won-deal values, active project counters, AM chips. |
| **Work Center / List / Detail / Threads** | `pages/work/*` | **Complete** — Module overview, list/board/calendar views, subtask trees, CSV bulk import, delegate/forward, add-multiple (bulk create), audit trail. |
| **Tasks / Follow-ups** | `pages/follow-ups/FollowUpsPage.tsx` (+ `routes/api.js` follow-up endpoints) | **Complete** — Due/Today/Upcoming/All tabs, inline completion, fast reschedule. |
| **Companies** | `pages/companies/*` | **Complete** — KPI grid, inline add-lead drawer, attachments & documents, activity stream, collaborators, campaign breakdown. |
| **Campaigns** | `pages/campaigns/*` | **Complete** — Spend/leads/CPR/conversion metrics, live status toggle, attribution table. |
| **Settings** | `pages/settings/*` (`WorkTypeBuilder.tsx`, `AutomationsTab.tsx`) | **Complete** — Stages, Custom Fields, Labels, Terminology, Look & Feel, Custom Modules Builder, Automations Engine. |
| **Team** | `pages/team/TeamPage.tsx` | **Complete** — Members, role permission matrix, invitations, CSV import/export. |
| **Mail** | `pages/mail/MailPage.tsx` | **Complete** — 3-pane composer, merge tags, templates, SMTP verification. |
| **Integrations** | `pages/integrations/IntegrationsPage.tsx` | **Complete** — Meta Ads & GA4 guides, webhook pipe with cURL/fetch snippets, scheduler. |
| **Search** | `pages/search/SearchPage.tsx`, `components/SearchModal.tsx` | **Complete** — Deep search page + global spotlight search. |
| **Reports & Analytics** | `pages/reports/*`, `pages/analytics/AnalyticsPage.tsx`, `pages/portfolio/PortfolioPage.tsx` | **Complete** — Report builder, tabular reports, chart analytics, PDF export. |
| **Auth & Errors** | `pages/auth/*`, `pages/errors/*` | **Complete** — Login, Signup, Forgot/Reset Password, 403/404/500. |

---

## 3. Work Division & Ownership Boundaries

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
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 4. Live-Code Correctness (the "ghost" finding — now resolved)

**Everything below has been independently verified against source on 5 Sept 2026.**

### Root cause ("ghost code")
- `server/src/routes/*.js` **except `routes/api.js`** (~6,900 lines: auth, customers, dashboard, companies, work, team, settings, campaigns, clients, mail, integrations, notifications, search, audit, tasks) was **never loaded** by `server.js`. It ran its own express-session/CSRF stack and was 100% dead.
- `server/src/models/WorkItem.js` (a 50-field, platform/content-specific schema) was registered at boot but **never queried or written** by any live route. The real engine runs on the generic `CustomRecord` model.
- `GAP_REPORT.md` previously claimed duplicates clustered by "phone/email/name" — the shipping code **only grouped by email and phone**.

Any audit that opened these files reported on code that does nothing in production — the cause of inconsistent past audit results.

### Fixes applied (5 Sept 2026)
| # | Fix | Evidence |
|---|---|---|
| 1 | **Removed dead code.** Deleted all unused `routes/*.js` (kept `routes/api.js`) and `models/WorkItem.js`; removed the boot registration. | `server/src/routes/*`, `server/src/server.js` model list |
| 2 | **Removed dead session stack.** Dropped `express-session` + `connect-mongo` (nothing used `req.session`; its error handler called `process.exit(1)`). Deps removed from `package.json`. | `server/src/server.js` |
| 3 | **CSV formula injection fixed.** `escapeCsvValue` now neutralizes leading `= + - @` (and tab/CR). Verified: `=HYPERLINK(...)` → `'=HYPERLINK(...)`. | `server/src/utils/csv.js` |
| 4 | **SSRF guard on outbound webhooks.** URLs are validated for http(s) + resolved DNS (all A records) blocked when they hit loopback/private/link-local/metadata ranges (`localhost`, `127.x`, `10.x`, `169.254.x`, `172.16–31`, `192.168.x`, `::1`, `fe80`, `fc00`, IPv4-mapped). Tested: 9 blocked cases pass. | `server/src/services/webhookDispatcher.js` |
| 5 | **Reminders now reach email.** `Notification` gains a `channels` field (`['inapp','email']`); `deadlineAlerts` resolves each assignee's email and sends overdue/today/tomorrow reminders via the existing SMTP account when configured (toggle: `REMINDER_EMAIL_ENABLED`). | `server/src/models/Notification.js`, `server/src/services/deadlineAlerts.js` |
| 6 | **Meeting split + call-recording links.** Activity supports `meeting_client` and `meeting_internal` (plus legacy `meeting`) and a structured `callRecordingUrl`; UI composer adds both meeting chips and a recording-link field on calls/meetings. | `server/src/models/Activity.js`, `server/src/api/customers.js`, `client/src/pages/customers/CustomerDetailPage.tsx` |
| 7 | **Name matching shipped for duplicates.** `/api/customers/duplicates` now clusters by normalized name in addition to email/phone; merge allows same-name matches (manager-gated, side-by-side). | `server/src/api/customers.js`, `client/src/pages/customers/DuplicatesPage.tsx` |
| 8 | **White-label branding.** Login, sidebar brand, Analytics header, and the browser tab title now use `organization.name` (neutral fallbacks pre-auth) instead of hardcoded "Vande". | `client/src/components/Sidebar.tsx`, `LoginPage.tsx`, `AnalyticsPage.tsx`, `contexts/AuthContext.tsx`, `index.html` |
| 9 | **Content deliverable tracking** — verified present, not re-built. The `video`/`content` WorkTypes already carry `platform, designType, hook, caption, views, likes, comments, shares, saves, footageLink, thumbnailLink, publishedLink, deliveryLink` etc. via the WorkType builder (`DEFAULT_WORK_TYPES`), synced per workspace. | `server/src/config/defaultWorkTypes.js`, `server/src/services/defaults.js` (`syncWorkTypeDefaults`) |

### Second independent audit (same day) — new findings, now resolved
| # | Finding | Resolution |
|---|---|---|
| 10 | **🔴 Password hashes returned to browser.** `api/team.js` used `.lean()` on three `User` queries (list, create, update), bypassing the schema's `toJSON`/`toObject` hash-stripping transform. Every Team-page viewer received every teammate's `passwordHash` + `passwordResetTokenHash`. | All three now `.select('-passwordHash -passwordResetTokenHash -passwordResetExpiresAt')`. Verified no other `User.lean()` leaks (remaining `audit.js`/`settings.js` queries already select safe fields). |
| 11 | **🟠 Automation-created records got a garbage `createdBy`.** `services/automation.js` fell back to `customer.createdBy || rule._id`; `Customer` has no `createdBy`, so unassigned leads wrote an `AutomationRule` ObjectId into a required `User` ref. | New `resolveCreatedBy()` falls back to the org's first active admin, then any active user, else `null`; `CustomRecord.createdBy` is now nullable (`default: null`). |
| 12 | **🟡 PDF exports silently truncated + mangled data.** `utils/pdf.js` capped every export at 300 rows, cut cells at 32 chars, and replaced all non-ASCII (₹, Devanagari) with `?` — all silently. | Now renders a visible `Showing first 300 of N rows. Export CSV for the complete data set.` notice and appends `...` to truncated cells. (Full UTF-8 font support still needs a real PDF lib — tracked in Known Gaps.) |
| 13 | **De-branding gap.** Password-reset email subject hardcoded `"Reset your Vande Agency CRM password"`. | Subject now reads `Reset your {Organization.name} password`. |
| 14 | **Dead EJS middleware.** `middleware/notifications.js` (`res.locals`/`X-Soft-Nav`, EJS-era) was unused; `middleware/security.js` (security headers) was unused. | Notifications middleware deleted; **security-headers middleware now mounted** in `server.js` (X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS in prod). `middleware/csrf.js` unused → deleted. |
| 15 | **No `.env.example`.** 13+ load-bearing env vars were discoverable only by grepping source. | Added `.env.example` documenting every var, its default, and which four are production-required. |

### Verification (5 Sept 2026)
1. `cd client && npx tsc --noEmit` → **0 errors**.
2. `cd client && npm run build` → **Clean production build**.
3. `node --check` over all `server/src` files → **0 failures** (78 files, after dead-code removal).
4. Full server boot → starts, connects to MongoDB, and listens on the API port.
5. SSRF block-list test → 9/9 private/reserved targets rejected.
6. CSV export of malicious leads (`=HYPERLINK`, `+44`, `@cmd`, `-2+3`) → every dangerous cell neutralized.
7. Team API no longer transmits `passwordHash`/`passwordResetTokenHash` (`.select` exclusion verified by inspection + grep).
8. PDF test (305 rows) → renders `Showing first 300 of 305 rows...` notice; small exports render no notice.

### Third independent audit (6 Sept 2026) — findings and resolutions

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 16 | **Critical** | `api/middleware/auth.js` had a hardcoded fallback JWT secret (`'dev-jwt-secret-change-in-production'`) used when `JWT_SECRET` was unset — an attacker with no env access could forge any admin JWT. | `server.js` now **exits at boot** if neither `JWT_SECRET` nor `SESSION_SECRET` is set (any environment). `api/middleware/auth.js` also throws defensively if the resolved secret equals the old fallback literal. `JWT_SECRET` added to the production required vars list. |
| 17 | **High** | Dead EJS middleware files `src/middleware/auth.js` + `src/middleware/rateLimiter.js` were still present — used `req.session`, `res.render('auth/login')`, `res.redirect('/auth/login')`, and `res.status(429).json(...)` (the live rate limiter lives in `api/middleware/`). | Both files deleted; only `src/middleware/security.js` remains in `src/middleware/`. `node --check` verified across 76 surviving server files. |
| 18 | **High** | DNS rebinding SSRF gap: `webhookDispatcher.js` resolved the hostname and connected in the same call — a rebinding attack between save and dispatch could reach private IPs. | New `assertAndResolveWebhookUrl()` resolves + validates once; `postJsonPayload` connects to the pre-validated IP address (`hostname: resolvedIP`, `servername: original hostname`, `Host` header = original host). |
| 19 | **High** | PDF non-ASCII mapping: `₹` → `?` still silently. | `utils/pdf.js` now has an `ASCII_MAP` translating `₹`→`Rs.`, `€`→`EUR`, `£`→`GBP`, `–`→`-`, `—`→`-`, `'`→`'`, `"`→`"`, `"`→`"`, `…`→`...` before the catch-all `?` rule. Devanagari/CJK still fall back to `?` (full UTF-8 font support tracked in Known Gaps). |
| 20 | **Medium** | `Organization.name` was not editable in-product (theme was); the white-label gap from §5 was still live. | **New `PUT /api/settings/organization` endpoint** (admin-only) accepts `name`, `analyticsHeading`, `currency`, `locale`; returns the updated organization. Audit-logged. |
| 21 | **Medium** | Team CSV import template hardcoded `'Vande Digital Academy'` as an assigned company example; export filename was `vande-crm-team.csv`. | Template now uses generic `'Acme Inc|Example Corp'` with `agent@example.com`; filename changed to `crm-team-import-template.csv`. Team export filename changed to `crm-team.csv`. |
| 22 | **Medium** | `AnalyticsPage` heading hardcoded `'… Digital Insights'` suffix. | Heading now reads `[orgName, analyticsHeading].filter(Boolean).join(' ')`, defaulting to `'Digital Insights'` when unset. |
| 23 | **Medium** | No rate limiting outside the `/api/auth/*` login block — mail send, report builder, report exports, CSV export/import, team import/export, client dashboard export were all unbounded. | `getRateLimiter` (429 JSON) now applied to: `mail/send` (60/min), report builder+save (60/min), report+custom export (30/min), customer CSV export (30/min) + import (10/min), team export (30/min) + import (10/min), client dashboard export (15/min). |
| 24 | **Low** | Nine debug/boot log files (`boot*.log`, `b2.*.log`, `b3.*.log`) shipped in `server/` (gitignored but unclean). | All 9 files deleted. |
| 25 | **Low** | Outbound webhook dispatcher used a hardcoded `User-Agent: CRM-App/1.0` and logged the original hostname on boot (`CRM outbound webhook endpoint …`). | UA now configurable via `WEBHOOK_USER_AGENT` env (default: `CRM-Webhook-Dispatcher/1.0`); boot log changed to `'CRM API listening.'`. `.env.example` updated. |

### Client-side changes (6 Sept 2026)
| Area | What changed |
|---|---|
| `api/auth.ts` | New `OrganizationInfo` type added with `analyticsHeading`, `currency`, `locale`; `User.organization` now typed as `OrganizationInfo`. |
| `api/settings.ts` | New `OrganizationInfo` type; `settingsApi.updateOrganization()` added. |
| `pages/settings/SettingsPage.tsx` | New **Workspace** tab (`id: 'org'`, `Building2` icon, admin-only) with form fields: workspace name, analytics heading, currency, locale. Breadcrumb + header updated. State wired to `loadSettings` + `refreshUser()` on save. |
| `pages/analytics/AnalyticsPage.tsx` | Heading now `[orgName, analyticsHeading].filter(Boolean).join(' ')` — fully white-labeled. |

### Verification (6 Sept 2026)
1. `cd client && npx tsc --noEmit` → **0 errors**.
2. `cd client && npm run build` → **Clean production build** (5.6s).
3. `node --check` over all 76 `server/src` files → **0 failures**.
4. Full server boot → starts, connects to MongoDB, and listens on the API port.
5. All 9 debug log files confirmed deleted.

---

## 4b. Fourth independent audit (6 Sept 2026) — findings and resolutions

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 26 | **High** | Field-level work permissions were dead code. `config/roles.js` defined `canEditWorkField` (per-role/per-field ACL for specialists & custom roles) but it was **called nowhere**; `PUT /api/work/:type/:id` applied every body field unconditionally, so a video editor could reassign/reprioritize/re-date work items (or change any field) via direct API calls, bypassing what the UI hides. | `canEditWorkField` is now wired into `PUT /api/work/:type/:id` — every field assignment (title, priority, deadline, startDate, deliveredAt, notes, customer, assignedTo, collaborators, secondaryAssignee, relatedRecords, and custom fields) is gated through it; disallowed fields are silently dropped so legitimate UI partial updates still work. `POST /:type/:id/delegate` and `POST /:type/:id/status` also enforce `assignedTo`/`status` gating. Defensive guard added: `editableFieldKeys` must be an array before use. |
| 27 | **High** | Company attachments leaked full binary data on every page load. `companies.js` `Attachment.find(...)` never did `.select('-data')` and the upload returned the populated doc (`data`), unlike the equivalent lead-attachment code in `customers.js` which strips it. | `companies.js` attachment list query now `.select('-data')`, and the upload response returns metadata only (matches the lead pattern). Download route still streams the full binary on demand. |
| 28 | **High** | Deleting/merging a lead orphaned Work Center items and emails. `customers.js` deleted/repointed `Activity` and `Attachment` on lead delete/merge, but **not** `CustomRecord` or `EmailMessage` — work and email tied to the merged/deleted lead silently became unreachable. | Lead delete now also `CustomRecord.deleteMany` + `EmailMessage.deleteMany`; merge repoints both (`customer` → `primary._id`). `EmailMessage` model import added. |
| 29 | **Medium** | Rate limiters shared one global per-IP counter. `rateLimiter.js` keyed everything by IP alone, so all 9 limiters (login, CSV import/export, mail send, report build/export, …) stomped on the same bucket — one teammate's bulk export could lock the whole office out of login. | Each `getRateLimiter()` instance now gets its own scoped bucket key (`scope:ip`), auto-assigned a unique name per instance. Login, mail, import/export, and report limiters no longer interfere. |
| 30 | **Medium** | Deleting a work item orphaned its subtasks. Subtasks are separate `CustomRecord` docs linked via `parentRecord`; `DELETE /:type/:id` removed only the parent. | Delete now removes the parent **and** all records with `parentRecord: item._id` in one `deleteMany`. |
| 31 | **Medium** | `ensureMonthlyRecords` had a check-then-create race. Two concurrent GETs to the work center could both pass the `exists()` check and double-create the monthly billing record (or a recurring monthly instance). | `ensureMonthlyRecords` now uses atomic `updateOne` **upserts** keyed on `billingMonth` / `recurringSource+recurringMonth` with `$setOnInsert`; duplicate-key errors (11000) from a concurrent winner are swallowed. Partial unique indexes added on `CustomRecord` to enforce it at the DB layer. |
| 32 | **Low** | Attachment size caps differed for no reason: leads 3 MB vs companies 5 MB. | Unified to 5 MB for both. |
| 33 | **Low** | `.env.example` shipped `ALLOW_PUBLIC_SIGNUP=true` with no email verification — open tenant creation out of the box. | Default flipped to `false` (locked down); `.env` matched. Existing deployments must opt-in to public signup. |
| 34 | **Low** | No `Content-Security-Policy` header. | `middleware/security.js` now sets a strict API-scoped CSP (`default-src 'none'`, `frame-ancestors 'none'`, …) on `/api/*` responses. Deliberately NOT applied to the SPA static build (which needs its own script/style origins) — scoped via `req.path.startsWith('/api/')`. |

### Dev-environment fix (6 Sept 2026)
- `npm run dev` crashed after the fail-closed JWT guard landed because no env was configured. A gitignored **`.env`** (repo root, with real random dev secrets) now exists so the server boots locally. **Note:** existing local DB integration/SMTP credentials were encrypted under an old key and will fail decryption until re-entered via the UI (they re-encrypt under the new `CREDENTIALS_ENCRYPTION_KEY`).

### Verification (6 Sept 2026 — fourth audit)
1. `cd client && npx tsc --noEmit` → **0 errors**.
2. `cd client && npm run build` → **Clean production build** (5s).
3. `node --check` over all 76 `server/src` files → **0 failures**.
4. Full server boot → JWT guard passes, connects to MongoDB, listens on the API port.

---

## 5. Known Gaps (accepted, not yet implemented)
- Reminder delivery is **email + in-app only** — no SMS channel yet.
- Outbound webhook SSRF checks happen at dispatch; storing a URL doesn't re-validate at save time (harmless: dispatch is the security boundary).
- Name-based duplicate clusters can include same-name/different-person leads; merge is manager-confirmed against a side-by-side comparison.
- PDF export is still built on a hand-rolled writer (Helvetica) — non-ASCII glyphs outside the ASCII_MAP (Devanagari, CJK) still render as `?`. Truncation is now *visible*, but full UTF-8 support requires a proper PDF library + embedded font (e.g. pdfkit).
- `Organization.currency` and `Organization.locale` are stored but not yet wired into the client for formatting — currency symbols, date/number formatting still use locale defaults. Tracked for a future PR.
- `User.email` is globally unique across all organizations in the schema. Per-tenant email isolation hasn't been implemented (low priority for single-org deployments).
- Lead search uses indexed-scoped `$regex` rather than the `$text` index; fine at current scale, becomes slower as a workspace's lead count grows.
- No automated test suite (see §6 — manual verification protocol is the current safety net).
- After switching to a fresh `CREDENTIALS_ENCRYPTION_KEY`, any previously stored integration/SMTP credentials in an existing local DB can no longer be decrypted until re-entered through the UI (they re-encrypt automatically). This is a one-time ops migration for non-fresh databases only.

---

## 6. Verification Protocol

Every change must pass this verification pipeline:
1. `cd client && npx tsc --noEmit` → Must exit 0.
2. `cd client && npm run build` → Must exit 0.
3. `node --check server/src/**/*.js` → Must exit 0.
4. New code must be reachable from `server.js`'s mount list (no dead route files).
5. Commit with descriptive semantic messages.