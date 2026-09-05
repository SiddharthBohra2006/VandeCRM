# Real migration status: EJS CRM → React + TypeScript

Audit date: 4 September 2026. Requested by the project owner. Independent source audit by Codex.

Reference: `D:\VandeAgencyCRM`. Migration: `D:\vandecrmreact`.
Migration HEAD inspected: `d54da637563453d601419da7b45ad6f3dd7138a2` — `fix(dashboard): resolve pin dashboard cards modal toggle and state handling`.

## Task workflow implementation — 5 September 2026

The React migration now includes the missing operational task flow across every configured work area (including video production):

- Task Center has a team-workload view showing each eligible team member and their current tasks, plus an unassigned lane.
- Tasks can be assigned from the overview or board selector and moved between people by drag and drop.
- Managers can create up to 100 tasks from newline-separated titles with one owner, priority, and deadline.
- Forwarding preserves the former owner as a collaborator and records actor, previous/new owner, previous/new status, handoff note, and timestamp.
- Every task detail shows its lifecycle, including explicit rejected and completed events; board cards show forwarding counts.
- Status drag and drop continues to use the configured statuses and now records every transition in the lifecycle.
- The deadline scheduler starts with the server, runs hourly, and alerts the owner, secondary assignee, and collaborators with per-person daily deduplication.

Verification: production client build passed (1,915 modules), TypeScript passed, all changed server files passed `node --check`, workflow schema validation passed for valid and rejected event values, route registration passed for bulk-create, delegate, and status endpoints, and `git diff --check` passed.

## Recheck after repair commit and follow-up fixes — 5 September 2026

Migration HEAD rechecked: `5a17aefb404406d8cb617ceb1f2b745392e3719b`. The working tree also contains the follow-up fixes listed below; they are intentionally left uncommitted for review.

The source status is materially different from the original 4 September audit. The large repair commit addresses permission-driven navigation, authenticated routing, import mappings/defaults, dashboard saved layouts, work views and pagination, team permission matrices, integration lifecycle endpoints, report route precedence, accessible dialogs, attachment downloads, workspace invalidation, search scoping and multiple data-integrity issues. The follow-up recheck then found and fixed these remaining confirmed defects:

- Restricted dashboard custom fields could still escape in stage cards, attention cards and field definitions. All three response paths now use the lead-field visibility rule.
- Customer creation accepted an arbitrary organization workspace ID, and duplicate detection/merge was organization-wide. Creation now restricts cross-workspace targeting to managers and active workspaces; duplicate operations use the active workspace scope.
- Integration Clear buttons called the ordinary preserve-secret endpoint. They now call the dedicated Meta and GA4 clear endpoints. Run-due, API-key enable/disable and rotation controls are connected to their implemented endpoints.
- Client bulk deletion used `window.confirm`; it now uses the shared keyboard-complete `ConfirmDialog`.
- The Activity dashboard preference now controls the rendered activity feed, and failed dashboard card reorders roll back with visible feedback.
- Both React import flows now accept `.csv`, `.xls` and `.xlsx`; Excel converts the first worksheet with the same SheetJS 0.20.3 browser build as EJS.

Current verification evidence:

| Check | Result |
|---|---|
| Production client build after the final Excel/import fix | Passed: 1,915 modules transformed |
| Full TypeScript check | Passed |
| `node --check` across all top-level API files plus server entry | Passed: 19 APIs plus `server.js` |
| Credential-response regression check with nested Mongoose and lean shapes | Passed for admin, manager, agent and client synthetic roles |
| Recheck invariants for dashboard field visibility, workspace-scoped duplicates and dedicated credential clearing | Passed |
| Working-tree whitespace/error check | Passed; only Git's CRLF normalization warning remains for `SYNC.md` |

A 100% runtime and pixel-parity sign-off still requires an authenticated disposable database and the role/workspace/responsive matrix in the final section of this document. That environment was not available in this task, so the source and production-build gates are green while live parity remains unverified. The Excel reader also needs network access to the same SheetJS CDN used by EJS.
## Verdict

**The migration is not 100% complete and is not ready for a parity sign-off.** Most screens and much of their styling exist. Several apparently finished controls have no effective behavior, some APIs violate the existing data model, and several permission gates have disappeared. These are functional and data-integrity problems, not merely optional polish.

The pin-dashboard UI now exists. Calling it missing would be stale advice. Its saved views, draft/cancel behavior, section toggles, feedback, and accessibility still need work. The same distinction applies throughout this report: a page, button, endpoint, copied stylesheet, or passing build does not prove equivalent behavior.

This is a broad source-based audit, not a claim that every possible runtime defect has been found. **No authenticated browser workflow or pixel comparison was completed:** both `http://localhost:5173` and `http://localhost:5000` returned `net::ERR_CONNECTION_REFUSED` in the browser. No CRM records were created, deleted, imported, merged, messaged, or changed during this audit. No application source was changed. Items needing live verification are explicitly separated below.

## Evidence and reading guide

- **Confirmed:** directly established from implementation, route wiring, or a local isolated check. Reproduction instructions below are acceptance tests to run on disposable data; they do not imply they were executed against a database.
- **Candidate:** a concrete source concern needing rendered UI or live-data confirmation.
- **P0:** permission/data exposure or potentially destructive corruption; block release.
- **P1:** broken core workflow or missing substantive EJS behavior; block parity sign-off.
- **P2:** incorrect feedback, navigation, persistence, visual or accessibility behavior.
- Paths beginning `client/` or `server/` refer to the migration. `EJS:` paths refer to the original repository. Line references identify the inspected snapshot; use the named function/route if later edits move them.
- A defect can exist in both versions. Shared-code concerns are not automatically migration regressions. Where the original provenance was not fully isolated, that is stated.

Checks actually performed:

| Check | Result |
|---|---|
| `npx --no-install tsc --noEmit --incremental false` in migration client | Exit 0 |
| `node --check` for all top-level `server/src/api/*.js` | 19 files, zero syntax failures |
| Express route-stack matching and direct invocation with fake request/response, no DB | `/module-builder` matches `/:reportKey`, returns 404; `/module-builder/export.csv` matches `/:reportKey/export.csv`, returns 404 |
| Instantiate `CustomRecord` in memory, without saving | No `subtasks` schema path; `item.subtasks` is `undefined` |
| Execute work-detail populate against a mocked collection result, no DB | `StrictPopulateError` for `subtasks.assignedTo`; plain standalone Model.populate was not sufficient to reproduce it, but the query-shaped check was |
| Compare original and copied models, utils, services, config, middleware, normalizing CRLF | No missing or different files in those five directories |
| Inventory | 43 EJS templates including partials; 40 React page/component files under `pages` |
| Git state at initial inspection | Clean; latest commit is the dashboard pin fix above |
| Browser availability | Ports 5173 and 5000 refused connection |
| Production bundle / authenticated end-to-end / visual regression | Not run in this audit; previous documents' build claims are not new test evidence |

The copied model/service foundation matching EJS is useful, but it makes the API/model disagreements below more significant: the new handlers sometimes do not use the copied foundation correctly.

## A. Release blockers: permissions, workspace boundaries, and data integrity

### SEC-01 — P0 — Audit API lost its permission gate [Confirmed]

`server/src/api/audit.js:7–10` applies authentication only and returns organization audit logs and the user directory. EJS mounts `/audit` behind `requirePermission('audit.view')` in `server.js:199`.

**Impact:** a signed-in user without audit permission can call the API even if the sidebar hides the page. **Acceptance:** direct API calls from a role without `audit.view` return 403; permitted users retain the existing filters and data.

### SEC-02 — P0 — Mail API lost view and action permission gates [Confirmed]

`server/src/api/mail.js` imports `hasPermission` but never calls it. The router only uses `requireApiAuth`. This affects GET, send, template create/update/delete, and SMTP settings. EJS uses `mail.view` at mounting and `mail.create`/`mail.update` on actions.

**Impact:** hiding Mail does not prevent direct access or sending/configuration changes. Its customer filter also special-cases only `role === 'agent'`, rather than the current restricted custom-role rules. **Acceptance:** exercise every action with view-only, create-only, update-only and denied roles; also verify recipient visibility.

### SEC-03 — P0 — Integration API lost permission checks and returns sensitive company fields [Confirmed]

`server/src/api/integrations.js:18` only authenticates. GET queries whole company documents and returns both `companies` and checklist entries containing `apiKey`; credential changes, synchronization and retries likewise have no action-permission guard. EJS mounts Integrations behind `integrations.view` and guards its mutations.

**Impact:** unauthorized organization users can obtain integration data/API keys or alter integration settings. Return an explicitly sanitized response and restore the original action gates. Do not treat encrypted credential strings as appropriate public response data merely because they are encrypted.

### SEC-04 — P0 — Follow-up API lost tasks permissions [Confirmed]

`server/src/api/tasks.js` applies authentication and record scoping, but no `tasks.view` or `tasks.update` checks. EJS requires `tasks.view` on the router and `tasks.update` for complete/reschedule. Restore both; test direct denied API calls, not just button visibility.

### SEC-05 — P0 — Work mutations do not enforce assigned-record scope [Confirmed]

`server/src/api/work.js:359`, `:432`, `:478`, and `:515`: update, status, delete and subtask parent lookups do not apply `restrictToAssigned`, unlike the detail read and the corresponding EJS handlers. Subtask creation also lacks the create-action permission check. Update/status accept status strings without validating membership in the module; relationship and field validation is materially weaker than EJS `validateReferences`/record parsing.

**Impact:** a restricted user with module-level update access can target a different user's record ID; invalid status/reference data can also be persisted. **Acceptance:** assigned-only users cannot mutate unassigned records, and invalid status, foreign owner/customer/module references and disallowed fields are rejected before mutation.

### SEC-06 — P0 — Active workspace authorization is not revalidated [Confirmed]

`server/src/api/middleware/auth.js:45` trusts a token's `activeCompanyId`; when it is empty it accepts `x-active-company` without checking company membership. A user removed from a company can retain that token's workspace selection until expiry. `/auth/me` may display a fallback company while other APIs continue using the stale token company.

**Acceptance:** membership removal, inactive company and a forged header with an otherwise valid empty-workspace token must not grant access. Resolve one authorized workspace consistently for both context and data requests.

### SEC-07 — P1 — Login/recovery throttling disappeared [Confirmed]

`server/src/api/auth.js` has no rate limiter on login, signup, forgot/reset-password or admin recovery; the new server does not mount a replacement. EJS `src/routes/auth.js` attaches `getRateLimiter` to these endpoints. Restore equivalent protection. This is not a request to transplant session-CSRF code blindly into a bearer-token API.

### SEC-08 — P0 — Lead field visibility is not enforced on serialized records/CSV [Confirmed current defect]

`server/src/api/customers.js:305`, `:503` filter the list of field definitions, but serialize the full customer `customData`. `/export/csv:129` exports every active custom field without `canAccessLeadField(..., 'view')`. Dashboard similarly returns full customers/custom field definitions regardless of the lead field rules.

**Acceptance:** a field denied to a role must be absent from JSON and exports, not merely absent from the form. The full original exposure history needs separate comparison; this report does not claim every one of these exposure paths was introduced by React.

### SEC-09 — P0 — Raw User documents expose password hashes in API responses [Confirmed]

The shared `User` schema defines `passwordHash`, `passwordResetTokenHash` and `passwordResetExpiresAt` without `select:false` or a serialization transform. `team.js:73` returns unprojected User documents, and customer form options, company/campaign user lists and multiple populated owner/user relations likewise select whole users before serializing JSON. Auth sanitizes its own user response, but this does not sanitize the other APIs.

**Impact:** credentials-related fields become browser-visible where EJS previously rendered selected display fields rather than serializing entire models. **Acceptance:** inspect the full nested JSON shape of every domain response; only explicitly required public user properties may appear. Use synthetic values in regression tests, never real password hashes in audit artifacts.

### SEC-10 — P0 — Company, campaign and team read access is incompletely guarded [Confirmed]

Company and Campaign routers authenticate and enforce some mutation permissions, but their list/detail reads omit the original `businesses.view`/`ads.view` gates. Team GET similarly returns users/roles/companies with authentication only rather than the original internal-user/team access contract. Membership restrictions in some company/campaign queries do not replace module permissions. Restore the original read policy and test a signed-in client and a denied custom role directly against each API.

### DATA-01 — P0 — Updating CSV duplicates can erase existing values and reset stages [Confirmed]

`server/src/api/customers.js:110` loads duplicate candidates with only `name email phone phoneNormalized labels customData`. The import update at `:246` then relies on unloaded `existing.company/source/value/priority/leadScore/campaign/notes`, and always assigns a resolved/default stage. Missing numeric columns also evaluate through `Number(undefined) || 0`.

**Trigger:** import a duplicate with just email/name into an existing valued, qualified or won record. **Impact:** omitted fields are not reliably preserved; value/score can become zero, stage falls back, and notes/history context can be lost. **Acceptance:** sparse updates preserve all omitted data, explicitly blank values follow documented rules, and preview accurately shows the same changes that execution performs.

### DATA-02 — P1 — CSV execution omits EJS follow-up and workflow effects [Confirmed]

React `/import` never applies CSV `nextFollowUpAt` or the wizard's follow-up default/comment; it does not run per-record lead automation or create the equivalent per-record import/follow-up activity. EJS `src/routes/customers.js:1139` onwards handles those fields and effects. React also accepts `defaultAssignedToId` without validating an active, authorized owner.

**Acceptance:** test dates, notes, assignments, new records and updated records against EJS, including automation outcomes and timeline entries. A summary audit log is not a replacement for each record's behavior.

## B. Dashboard and pin-card parity

### DASH-01 — P1 — Saved dashboard tabs do not apply a saved view [Confirmed]

`client/src/pages/dashboard/DashboardPage.tsx:456`: clicking a saved tab only calls `setActiveViewId`. Loading at `:180` sends only `campaign`, not `dashboardView`; the API never resolves an active saved view. EJS `src/routes/dashboard.js:621` and `views/dashboard/index.ejs:16` apply the selected view's layout.

**Acceptance:** save two visibly different layouts, switch between them, reload each URL and use Back/Forward; cards/sections/counters must follow the selected view, not just the tab highlight.

### DASH-02 — P2 — Closing pin dialog can leave an unsaved metrics change visible [Confirmed]

The metric grid renders from `editSections` (`DashboardPage.tsx:488`) while other sections use `savedSections`. The close X and backdrop only close the dialog. Toggle Metrics off and dismiss using X/backdrop: the grid changes without a save. Cancel explicitly restores sections, so the dismissal paths disagree.

**Acceptance:** all dismissal methods discard draft state, or provide an explicitly consistent preview/commit contract. Reload must not unexpectedly reverse something presented as saved.

### DASH-03 — P1 — Activity-log section toggle has no corresponding section [Confirmed]

`SECTION_CHOICES` includes `activity`; the page never renders an Activity Log section or checks `savedSections.has('activity')`. EJS has separate activity content. The toggle is present but ineffective.

### DASH-04 — P2 — Saved-view loading inside the dialog mutates live sections before saving [Confirmed]

The Saved Views buttons at `DashboardPage.tsx:1140` call `setSavedSections` immediately as well as edit state. Cancel therefore cannot restore the previously committed layout. They also load card order without restoring a complete visibility/counter configuration.

### DASH-05 — P2 — Reorder/save-view failures are swallowed [Confirmed]

`DashboardPage.tsx:431` and `:1170` have empty catches. Dashboard drag reorder optimistically updates the grid without rollback. A network/permission failure appears to work until refresh; Save as view fails without an explanation. Surface the error and preserve a retryable draft.

### DASH-06 — P1 — Saved custom-field counters are not ported end to end [Confirmed]

EJS exposes “Add field counters,” saves `customFieldMetrics`, and builds the selected counters. React offers all fields as unpinned cards but has no saved-view field-selector payload; Save as view sends only name/sections/order. Its counter calculation derives from stage-card customers, excluding un-staged records rather than the whole EJS customer set.

**Acceptance:** select counters in a named view, save, reload and compare counts including records with no stage, false, empty and zero field values.

### DASH-07 — P1 — Dashboard visibility no longer mirrors permissions [Confirmed]

The React cards, quick links and section choices are largely unconditional; EJS gates them with `businesses.view`, `ads.view`, work permissions and other module permissions. `server/src/api/dashboard.js:95` also fetches/returns customer data without a businesses-view gate.

**Acceptance:** a work-only user sees only allowed work content; denied lead/ads cards and underlying data are absent.

### DASH-08 — P2 — Empty workspace welcome test differs [Confirmed]

React tests `totalCustomers === 0 && moduleStats.length === 0`. An empty workspace with configured modules fails that test. EJS checks whether any module actually has records. Compare a freshly configured workspace with zero records.

### DASH-09 — P2 — Sample movement preview is rendered twice [Confirmed]

`DashboardPage.tsx:884` and `:1190` both render overlays for the same `previewMovement`. This produces two modal layers/duplicate controls. Keep one equivalent preview with one focus lifecycle.

### DASH-10 — P2 — Pin dialog keyboard behavior differs from native EJS dialog [Confirmed]

React uses a conditional div with `role=dialog`; it has no Escape handler, focus transfer/trap/restoration or inert background. EJS opens a native dialog with `showModal()`. Check keyboard-only use, Tab/Shift+Tab, Escape and focus return to “Pin dashboard cards.”

### DASH-11 — P2 — Named-layout area may be clipped [Candidate; shared-style concern]

`client/src/styles/app.css:9266` fixes the dialog height to 620px with `overflow:hidden`, and every direct child form to `height:100%`. React puts a full-height preference form, optional saved-view block, then another form inside it. Render at short desktop and mobile heights and prove “Name this layout”/“Save as view” are reachable. Similar CSS/structure exists in EJS; do not label this a newly introduced regression without comparing both renders.

### DASH-12 — P2 — Search-empty message is misleading [Confirmed]

When a card search has no matching unpinned cards, React displays “All available cards are pinned,” even if other unpinned cards exist. Distinguish no search matches from no available cards.

## C. Leads, clients, detail and import

### LEAD-01 — P1 — Kanban buttons navigate to a missing route [Confirmed]

`CustomersPage.tsx:551` and `ClientsPage.tsx:410` link to `/pipeline`. `App.tsx` has no such route; its wildcard renders Not Found. Link to the existing pipeline behavior or implement the equivalent destination, retaining filters as appropriate.

### LEAD-02 — P1 — Add client creates through ordinary lead mode [Confirmed]

Clients links to `/customers/new?scope=client`; `CustomerFormPage.tsx` never reads that query and defaults to the ordinary active/default stage. EJS `/customers/new` at `src/routes/customers.js:853` restricts client-mode choices to won stages. The React form also always says New/Create Lead and returns to Leads.

**Acceptance:** Add client creates a record visible in Clients, with the correct stage choices, labels, cancel destination and post-save context. Client import also needs explicit scope handling; the wizard ignores that URL parameter.

### LEAD-03 — P1 — Follow-up KPI uses an unsupported quick-view value [Confirmed]

`CustomersPage.tsx:426` sets `view=followup`; the API at `customers.js:305` implements `overdue`, not `followup`. Clicking the KPI changes the URL but does not apply its promised filter. Test each tab/KPI query against the server, not just the visible active class.

### LEAD-04 — P1 — Saved lead/client view creation/deletion/application is incomplete [Confirmed]

EJS exposes `/customers/views` and `/customers/views/:id/delete` and applies saved configurations. The new customer API only fetches SavedView records; there are no save/delete endpoints. React list pages do not provide the equivalent saved-view UI; Clients finds `activeSavedView` after constructing/querying the filter rather than applying its configuration.

### LEAD-05 — P2 — Client selection checkboxes have no bulk action workflow [Confirmed]

`ClientsPage.tsx` maintains selected IDs and select-all, but has no corresponding bulk apply action. EJS uses the shared customers list machinery in client view. Test selection, clearing after page/filter changes and every permitted bulk operation.

### LEAD-06 — P2 — “Last activity” descriptions are fabricated from elapsed time [Confirmed]

`ClientsPage.tsx:49` maps age alone to “New message,” “Assigned to team,” “Follow-up scheduled,” or “Note added.” Those phrases are not derived from the record's actual event. Do not display them as history. Compare the equivalent lead-row helper as well before sign-off.

### LEAD-07 — P1 — Legacy detail/edit URLs are not covered [Confirmed]

React has `/customers/:id` but no `/customers/:id/edit` or `/clients/:id`; EJS serves these routes (client detail may redirect). Bookmarks/links using them land on Not Found. Inline editing can replace a screen, but preserve reachable navigation/redirect behavior.

### LEAD-08 — P1 — Attachment download links cannot send the required bearer token [Confirmed]

`CustomerDetailPage.tsx:579` and `CompanyDetailPage.tsx:784` are plain anchors into `/api/.../attachments/.../download`. All these routes require an Authorization bearer header; a normal anchor request does not obtain it from localStorage. Expected result is 401, not a file.

**Acceptance:** download through an authenticated blob request or another authorized download mechanism; verify filename, content, errors and denied access. Do not put the long-lived token in the URL.

### LEAD-09 — P2 — Detail upload is single-file, contrary to the master report [Confirmed]

Customer detail stores one `uploadFile` and uploads it once. The report claims a multi-file attachments manager. Test the exact EJS selection/upload contract and document supported size/count honestly; do not count multiple sequential uploads as multi-select parity.

### IMP-01 — P1 — Mapping/Ignore controls are cosmetic [Confirmed]

`CustomerImportPage.tsx:115` submits only CSV/name/duplicate rule for preview. `CustomerImportPreviewPage.tsx:52` executes without the `mappings` object. Yet it labels the displayed table “Applied Column Mapping.” The server normalizes without user mappings. Choosing Ignore or mapping a nonstandard header cannot do what the screen promises.

### IMP-02 — P1 — Excel upload is accepted but never decoded [Confirmed]

The wizard advertises `.xlsx/.xls`, accepts those extensions and calls `FileReader.readAsText`. There is no workbook decoding in this flow. Binary Excel files are interpreted as CSV text. Either restore the EJS workbook path or make supported inputs explicit; do not advertise working Excel migration until it is verified.

### IMP-03 — P1 — Import defaults and new-custom-field controls are incomplete [Confirmed]

The wizard has stages/users/companies state that is never populated, lacks the full default-stage/owner/workspace controls, and the visible follow-up defaults are dropped by the preview page and ignored by execution. “New custom field” never reaches a field-creation implementation in this import handler. EJS import has mapping/default processing in `src/routes/customers.js:1038` and `:1139`.

### IMP-04 — P2 — Back to Mapping loses the import draft [Confirmed]

Preview links to `/customers/import` without returning CSV or mapping state; the import page initializes empty local state and does not restore it. Users must upload/map again. Carry the complete draft backward and forward.

### IMP-05 — P1 — Preview and execution disagree on within-file duplicates [Confirmed]

The preview maps rows against the initial existing-customer map without adding earlier new rows. Execution updates that map after creation. Two new rows sharing an email/phone can preview as two creates but execute as create+update/skip. Preview must simulate the same duplicate rules as execution.

### IMP-06 — P2 — Upload drop text has no drop handler; failures use a native alert [Confirmed]

The wizard says “Drag and drop” but its label only contains an `onChange` file input and no drop/drag-over handling. Preview uses `alert()` on import failure (`CustomerImportPreviewPage.tsx:71`), contradicting consistent inline/themed feedback. Also handle file-read failures rather than leaving progress stuck.

### IMP-07 — P1 — Two customer import experiences have different capabilities [Confirmed]

Leads opens the inline CSV/preview modals in `CustomersPage.tsx`; Clients opens the standalone wizard. The standalone wizard's mapping/default promises and the modal's limited options differ, while both call the same reduced backend. Both entry points must pass the same EJS data-behavior tests. Do not sign off only the easier modal path.

## D. Work center, records, board, calendar and modules

### WORK-01 — P1 — Create subtask uses a nonexistent model property [Confirmed with model check]

`server/src/api/work.js:515–546` calls `item.subtasks.push`. `CustomRecord` has no embedded `subtasks`; EJS creates another CustomRecord with `parentRecord`, creator, module, customer, permissions, audit and notification effects (`src/routes/work.js:338`). The React UI also sends an owner object rather than a simple owner ID.

**Acceptance:** create a subtask, reload parent/list, open child, and verify deadline/priority/assignee, parent collaborator handling, audit and notification. The current endpoint cannot complete this workflow.

### WORK-02 — P1 — Work detail populates an invalid path [Confirmed with isolated query reproduction]

`server/src/api/work.js:252` populates `subtasks.assignedTo`, which is absent from the schema. Running a query-shaped check with a mocked collection result reproduced `StrictPopulateError` before any real database access. Remove that mismatch and load the real child-record relation. Live authenticated detail still needs verification after repair.

### WORK-03 — P1 — Overview view is selectable but has no renderer [Confirmed]

`WorkListPage.tsx` recognizes/enables `overview`, displays its link and hides the filter bar for it. Only list, board and calendar content branches exist. EJS `views/work/_overview.ejs` contains grouped overview and production-progress matrix behavior. Selecting Overview, or making it default, can leave the substantive content blank.

### WORK-04 — P1 — Work list stops at 200 without pagination [Confirmed]

The client requests `pageSize:'200'` and ignores the server's pagination object. There is no load-more/page navigation. List, board, calendar and parent/child completeness cannot be trusted above that count. Verify with more than 200 matching records, not a small demo set.

### WORK-05 — P1 — Configured filter fields are not rendered [Confirmed]

WorkTypeBuilder saves `presentation.filterFields`, but WorkList only renders hard-coded status and priority filters (`:400`). Owner/custom-field filters from the EJS configuration cannot be used. Apply configured field labels consistently as well as configured columns.

### WORK-06 — P1 — Work-center status semantics differ from shared completion rules [Confirmed]

`WorkCenterPage.tsx:40` treats only `completed` and `delivered` as closed, instead of module terminal flags used by `isClosed`/`isComplete`. It can classify custom terminal/cancelled records incorrectly. “Due today or earlier” filters from start-of-today to end-of-today, excluding earlier deadlines despite its label. “Mine” checks assigned/collaborator IDs as populated objects, but the center response does not populate collaborators and the filter ignores secondary assignees.

### WORK-07 — P1 — Delivered-date edits are ignored [Confirmed]

WorkDetail sends `deliveredAt` from edit state. The PUT handler updates start/deadline but never applies `body.deliveredAt`; it only auto-populates completion time if missing. Manually edited delivery dates do not survive reload.

### WORK-08 — P1 — Related-record/dependency editing is incomplete [Confirmed]

EJS create/edit forms include linked records/dependencies. The React detail edit state and work update handler do not round-trip `relatedRecords`; the list create flow does not expose the equivalent full relationship composer. Check both directions and preserve existing dependencies when saving unrelated fields.

### WORK-09 — P1 — Work CSV ignores assignedTo and bypasses typed field validation [Confirmed]

The import UI explicitly lists `assignedTo` as a supported header. `server/src/api/work.js:555` never sets it on created records; custom fields are copied as strings without the normal reference/type/required validation. Compare owner, numeric/date/checkbox/reference fields, invalid rows and partial-failure behavior with EJS.

### WORK-10 — P2 — Work CSV preview is not CSV-safe [Confirmed]

`WorkListPage.tsx:212` uses newline/comma splitting and strips quotes. Quoted commas, escaped quotes and multi-line cells produce an incorrect preview although the server uses `parseCsv`. The separate WorkImportPreviewPage is registered, but the current list import flow uses an inline preview; verify the actual entry path and displayed total, not just the existence of that page.

### WORK-11 — P1 — Existing module settings can be lost on save [Confirmed]

`WorkTypeBuilder.tsx:69` omits existing field min/max/default/help metadata from draft initialization; submission constructs a reduced field object and forces `presentation.fieldLabels: {}` (`:110`). EJS exposes attribute renaming and advanced field options. Opening and saving an existing module must preserve every supported property, even when the user changes only its name/color.

### WORK-12 — P1 — Configured key renaming needs data-preservation verification [Candidate]

WorkTypeBuilder rewrites a field/status key when its label is edited (`:240`, `:279`). Existing records and automations reference keys. The backend has `validateWorkTypeChange`, so do not assume silent corruption; verify that a simple display-label rename is allowed without forcing an unintended key migration or losing access to data.

## E. Shared shell, auth, preferences and responsive UI

### SHELL-01 — P1 — Workspace switch does not invalidate mounted page data [Confirmed]

AuthContext updates token/company/context, but AppLayout's Outlet is not keyed and most pages load only on mount, URL search params or record ID. Switching company while remaining on Dashboard, Customers, Settings, Tasks, Work or Setup can leave old-company data/forms visible while subsequent API calls use the new token.

**Acceptance:** switch A→B on each page without navigating away; records/options/selection/errors/caches must reset and reload together. A delayed A response must not overwrite B's screen. This is a cross-cutting issue, not one fix per stale screenshot.

### SHELL-02 — P1 — Company options and switch authorization disagree [Confirmed]

`auth.js:155` lists all organization companies for admin/manager; `:201` requires `assignedUsers: req.user._id` even for those roles. A visible company option can fail “Company not found or access denied.” EJS uses its company-access rules. Align listing, selection and token resolution.

### SHELL-03 — P1 — Saved terminology cannot load through /auth/me [Confirmed]

The companies query selects only `_id name isMain` (`auth.js:166`), then reads `activeCompany.terminology`. It was excluded by projection, so crmTerms falls back to Lead/Client. Verify renamed terms across sidebar, forms, lists, dashboard and reload after saving settings.

### SHELL-04 — P1 — Client users land on the internal dashboard [Confirmed]

React login/guest redirects use `/`, which always renders DashboardPage. Its API restricts to INTERNAL_ROLES. EJS root redirects client users to `/client-dashboard` (`src/routes/dashboard.js:526`); EJS sidebar has a client Reporting Dashboard link, absent in the React nav list. Verify login, home/logo and sidebar as an actual client role.

### SHELL-05 — P1 — Sidebar uses role shortcuts instead of the permission model [Confirmed]

`Sidebar.tsx:87` uses admin/manager flags and personal hidden preferences; it does not evaluate custom permission grants, `hiddenModules` or `hasWorkPermission` for the returned work types. It can expose denied links or hide explicitly granted Reports/Team/Settings access. Restore the EJS permission-driven navigation contract and enforce the same rules server-side.

### SHELL-06 — P2 — Hide Clients preference is discarded by API [Confirmed]

Sidebar uses `nav-clients`, but `dashboard.js:38`'s allowed sidebar keys omit it. Saving hidden items silently removes that key. Test every configurable nav item across save/reload.

### SHELL-07 — P2 — Mobile menu toggles an unstyled state [Confirmed source wiring gap]

TopBar toggles `.sidebar.mobile-open`; neither imported `app.css` nor `index.css` defines that state. Check the actual mobile sidebar behavior against EJS, including overlay dismissal, route selection, scroll and expanded/collapsed state; adding a class is not a functioning mobile menu.

### SHELL-08 — P2 — Topbar clock calculates IST incorrectly [Confirmed]

`TopBar.tsx:60` adds both 5.5 hours and the negated local timezone offset, then formats in local time. On an IST system this advances the displayed clock by 11 hours. Use a named timezone in formatting and verify on IST and UTC hosts.

### SHELL-09 — P2 — Theme persistence has conflicting sources [Confirmed]

TopBar saves `theme-preset` locally, but AuthContext applies the organization theme on every loaded/refreshed user. A selected preset can be overridden after reload/context refresh, while the picker still shows the locally saved preset name. Resolve the EJS user/org theme precedence consistently.

### SHELL-10 — P2 — Missing icon mappings render the wrong glyph [Confirmed]

The shared Icons component falls back to ClipboardList. Used names missing from its maps include `arrow-right`, `check-circle-2`, `calendar-clock`, `clock-3`, `shield-alert`, `trash-2`, `link`, `upload`, `lightbulb`, `eye`, `help-circle`. Affected areas include dashboard links, 403, work deletion/links/import and column customization. These controls render an icon, but not the intended icon.

### SHELL-11 — P2 — ConfirmDialog is not keyboard-complete [Confirmed]

`components/ConfirmDialog.tsx` has no initial focus, focus trap/restoration or background inertness. Escape calls cancel even while loading, unlike the disabled buttons/backdrop. Verify duplicate submissions when callers omit loading flags and avoid ambiguous dismissal during a running operation.

### SHELL-12 — P2 — Auth network errors and expired tokens have inconsistent handling [Confirmed]

AuthContext catches any `/me` failure and logs out, including transient 500/network failures. The shared fetch wrapper merely throws on later 401s and does not reconcile expired session state. Verify offline startup, token expiry during work and recovery without silent draft loss.

## F. Companies, campaigns, integrations, team, reports and remaining pages

### COMPANY-01 — P1 — Inline add lead is not scoped to the displayed company [Confirmed]

CompanyDetail sends `clientCompany: company._id` (`:226`), but customer creation validates against and persists `req.activeCompanyId`. Viewing company B while A remains active can reject B's stage or create in the wrong context. EJS company detail supplies a company-specific lead workflow. Scope deliberately and test A/B without relying on an incidental prior switch.

### COMPANY-02 — P1 — Company start date is populated from createdAt [Confirmed]

`CompanyDetailPage.tsx:129` initializes `startDate` from `res.data.createdAt`, not `res.data.startDate`. Saving unrelated company settings can overwrite the business start date. Use an existing company whose start and creation dates differ in the test.

### COMPANY-03 — P1 — Advertised 5 MB company uploads exceed JSON transport limit [Confirmed]

CompanyDetail accepts a 5 MB raw file and sends base64 JSON. Base64 expands it to about 6.67 MB, but the server's global JSON limit is 5 MB. Files near the advertised maximum fail before the attachment handler. Align the transport limit with raw-file validation, without weakening intended file limits.

### CAMPAIGN-01 — P2 — Saving campaign edits leaves derived metrics stale [Confirmed]

`CampaignDetailPage.tsx:119` sets the returned campaign after save but does not reload/update separately stored `metrics`, customers or the other derived state. Edit spend/conversions/revenue and compare metrics immediately versus reload. Filters are local state rather than EJS query-backed state, so date-filter reload/share behavior also needs parity verification.

### INT-01 — P1 — Inbound webhook endpoint is not mounted [Confirmed]

Original `server.js:175` mounts `src/routes/api.js`, containing POST `/inbound-lead`. The new server mounts only the domain APIs and never mounts an equivalent receiver, despite Integrations presenting webhook examples. Posting to `/api/inbound-lead` reaches the API 404. Preserve input contract, key status, validation, dedupe, attribution and workflow effects.

### INT-02 — P1 — Scheduled integration sync never starts [Confirmed]

EJS calls `startIntegrationScheduler()` at boot. The copied service exists, but the new `server/src/server.js` does not call it. Saving an interval is not evidence that the timer runs. Verify due jobs, restart behavior, retries and isolation in a test environment without contacting real providers during an audit.

### INT-03 — P1 — Clear credential buttons retain secrets and can alter the other provider [Confirmed]

IntegrationsPage sends empty Meta or GA4 fields to the ordinary save endpoint. That endpoint changes encrypted secrets only for nonempty values, so old encrypted credentials remain. It also normalizes both providers' IDs even when one is omitted; clearing one provider can blank the other's ID. EJS has a dedicated Meta-clear route.

**Acceptance:** save two providers, clear one, confirm its stored credentials/expiry/schedule behavior and preserve the other provider. UI success must reflect actual storage changes.

### INT-04 — P1 — API-key status controls and run-due workflow are missing [Confirmed]

EJS exposes `/companies/:id/api-key/status`, `/api-key/rotate`, and `/scheduled/run-due`. New integration routes do not contain these equivalents; company API does have regenerate, which is not the same as enable/disable. Inventory every integration control and maintain key revocation/rotation semantics.

### TEAM-01 — P1 — Fine-grained role editors are absent [Confirmed]

React Team role state/API accepts only name, scope and a flat permission array. EJS role create/update persists `leadFieldPermissions`, `fieldPermissions`, `workTypePermissions` and exposes per-field view/edit matrices. Member hiddenModules is supported in parts of the API but has no equivalent UI in TeamPage. Existing granular policy must remain editable and enforceable.

### TEAM-02 — P1 — Permanent user deletion replaces the EJS account lifecycle [Confirmed]

React offers delete and calls `User.deleteOne` (`team.js:275`). EJS offers deactivate/reactivate while preserving user history and references. React also has an isActive editor, so permanent deletion is an additional consequential behavior, not a necessary port. Restore the intended lifecycle; test assignment lists, audit attribution and last-admin/self rules without deleting real accounts.

### REPORT-01 — P1 — Module report builder and grouped export always hit generic 404 [Confirmed by isolated execution]

`reports.js:285` registers `/:reportKey` before `/module-builder:338`; `/:reportKey/export.csv:295` precedes `/module-builder/export.csv:346`. The generic handlers return 404 for this key rather than passing through. Exact route matching reproduced both failures. Move specific routes before generic ones and test page, grouped export, raw export and saved reports separately.

### REPORT-02 — P2 — Analytics Reset is a no-op [Confirmed]

`AnalyticsPage.tsx` renders an `/analytics` link but its handler only calls `preventDefault()`. No filters are cleared and no navigation occurs. Test after changing company, campaign and date range.

### REPORT-03 — P1 — Portfolio lost Open dashboard action [Confirmed]

EJS `views/dashboard/portfolio.ejs:30` has a per-company switch-and-open-dashboard form. React Portfolio cards only link to Settings; there is no equivalent Open dashboard action. Preserve the organization overview's direct workspace-entry workflow.

### REPORT-04 — P2 — Audit filters are no longer URL-backed [Confirmed]

AuditPage uses local state only and never reads/writes search parameters. EJS filter forms are GET requests. Reload, sharing a filtered audit URL and Back/Forward do not preserve equivalent state.

### SEARCH-01 — P0 — Search history is organization-wide and ungated [Confirmed current defect; provenance needs comparison]

`server/src/api/search.js` queues `history` with `allowed=true` and queries AuditLog by organization without accessible-record/workspace or audit-permission restrictions. The quick activity count is also organization-wide. Verify against the EJS search implementation before calling it newly introduced, but do not sign off restricted-role data isolation while this remains.

### SEARCH-02 — P2 — Search form can disagree with the browser URL [Confirmed]

SearchPage initializes form state from searchParams once, while result fetching reacts to later searchParams changes. Back/Forward can show results for one query with form fields from another. Resynchronize committed query/form state and test grouped pagination, filters and empty/error results.

## G. Visual and interaction verification still required

These are specific review targets, **not claimed screenshot-confirmed defects**. The unavailable local services prevented the requested live visual comparison. No “pixel-identical” or “all buttons work” certification should be inferred from the source audit.

| Area | Concrete verification target |
|---|---|
| Every main screen | Same data, same role/workspace, same theme, same viewport; compare layout, padding, typography, heading hierarchy, card order, count formatting, row density and alignment |
| Dashboard pin dialog | Available/Pinned widths, search, scroll regions, zero/all pinned, drag insertion, touch/keyboard alternative, footer visibility, cancel/save/reload, named views and selected counters |
| Leads/Clients tables | Frozen header/first column and horizontal-scroll affordances from original `public/js/table-scroll.js`; customize-column order/visibility, dynamic fields, date/UTM columns, pagination and contact actions |
| Customer detail | Exact EJS tab/composer layout, all activity types, follow-up dates/times, owner/stage/priority/campaign/labels/custom fields, files, related work and client-mode wording |
| Work views | Board scrolling, drop targets/rollback, real parent/child nesting, configured overview, calendar custom-date values/timezone boundaries, long titles and >200 records |
| Forms | Dynamic required/readonly/hidden fields, min/max/type validation, select/multi-select/user/reference fields, native-vs-EJS date/dropdown controls, field help/defaults |
| Mail | React uses inline `gridTemplateColumns: 180px 320px minmax(0,1fr)` with no responsive branch in the component; verify overflow/readability at 375px/768px and reproduce EJS responsive behavior |
| Analytics | Inline light background `#F8F9FB` versus dark/custom themes; compare with original styling before calling this a regression |
| Companies/Campaigns | Header actions, 10-card/metric layout, inline lead form, collaborators, inactive records, tracking fields, attachment table, campaign date filters and derived metric refresh |
| Settings/Team | Tab deep links, field/stage reordering, palettes, full role matrices, work builder advanced options, saved configuration after refresh |
| Global shell | All theme presets, custom colors, personal theme precedence, mobile open/close, hover/sidebar collapse, company switcher, clock, notifications and permitted navigation |
| All dialogs | Initial focus, trapped focus, Escape, cancel/backdrop, focus restoration, loading state, double-click protection, screen-reader names and viewport clipping |
| Failure feedback | 401/403/404/500, offline, slow/aborted request, retry after partial mutation, no stale data under new workspace, no success message for a failed action |
| Imports/exports | CSV UTF-8/BOM/quoted commas/newlines, Excel workbook parsing, sparse duplicate updates, dates/numbers, >50 rows, partial failures, names/content of downloads and authorization |

Other source candidates to verify: direct JSON serialization of attachment binaries on company detail; complete per-page handling of foreign-workspace links; preserving existing module help/default/min/max attributes; lead detail activity/audit effects across alternative stage/owner edit paths. Do not count these as reproduced defects without following the actual route and data.

## H. Coverage matrix and acceptance checklist

Status here means source coverage, not browser certification. “Implemented” means a corresponding implementation was located; every row still requires the acceptance checks indicated.

| EJS domain/templates | React counterpart | Real status / remaining checks |
|---|---|---|
| partials head/header/footer/sidebar/topbar | AppLayout, AuthLayout, Sidebar, TopBar, index/theme/styles | Implemented shell; workspace, permissions, client navigation, clock, mobile and theme gaps above |
| auth/login.ejs (multiple auth modes) | Login, Signup, ForgotPassword, ResetPassword | Basic pages exist; rate limits, client landing, disabled-signup UI, emergency recovery route/UI and expiry/network behavior need closure |
| dashboard/index.ejs | DashboardPage + dashboard API | Present; pin/view/sections/permission defects; no live visual approval |
| customers/index.ejs lead mode | CustomersPage | Present; Kanban, follow-up filter, saved views, field confidentiality, imports, bulk/column parity |
| customers/index.ejs client mode | ClientsPage | Present; client scope, dead selection, saved views and navigation |
| customers/form.ejs | CustomerFormPage and detail edit | Create present; client mode/edit URL, field types/defaults and validation parity |
| customers/detail.ejs | CustomerDetailPage | Present; downloads, client context, permissions, edits and timeline effects must pass |
| customers/duplicates.ejs | DuplicatesPage | Detection/merge UI and handler exist; verify cross-workspace merge boundaries, preserved fields/activity/attachments/work/email references and failed merge recovery on disposable data |
| customers/import.ejs | CustomerImportPage and CustomersPage modal | Two flows; broken mapping/Excel/defaults; no import certification |
| customers/import-preview.ejs | CustomerImportPreviewPage and modal | Preview exists; mapping claim, duplicate simulation and Back behavior wrong |
| customers/import-results.ejs | CustomerImportResultsPage | Page exists; execution-result warnings/skips/errors must come from actual import, not just preview warnings |
| work/center.ejs | WorkCenterPage | Present; custom terminal states, mine/today semantics and workspace invalidation |
| work/index.ejs | WorkListPage | List/board/calendar present; missing overview, pagination, configured filters and complete relationship forms |
| work/_overview.ejs | No equivalent overview renderer located | Substantive missing workflow matrix/grouping view |
| work/detail.ejs | WorkDetailPage | Present; invalid populate/subtask write, delivered date/dependencies and record permissions |
| work/_custom-fields.ejs and _category-fields.ejs | WorkList/WorkDetail field rendering | Partial equivalent; test every supported field type/group and constraints |
| work/import-preview.ejs | Inline work preview + WorkImportPreviewPage | Existing routes/screens do not prove CSV or owner/field fidelity |
| tasks/index.ejs | TasksPage | Complete/reschedule/history/contact buttons exist; missing API permission gates; live date/history tests pending |
| companies/index.ejs | CompaniesPage | Create/edit/switch/main-company flows exist; role, switching and response/context behavior pending |
| companies/show.ejs | CompanyDetailPage | Major sections now exist; downloads, add-lead scope, start date and upload limit bugs |
| campaigns/index.ejs and show.ejs | CampaignsPage, CampaignDetailPage | CRUD/filter/metrics/status UI exists; action permissions, dates, status semantics and metrics refresh need verification |
| settings/index.ejs | SettingsPage, AutomationsTab | Panels exist; terminology load and field/role/workflow effects need end-to-end checks |
| settings/_work-type-builder.ejs | WorkTypeBuilder | Present but loses configuration; overview/configured filters not consumed fully |
| settings/setup.ejs | SetupPage | Checklist/preset/demo controls exist; guard destructive demo actions and verify context refresh on test DB only |
| team/index.ejs | TeamPage | Basic CRUD/roles/CSV exist; granular policy and account lifecycle differ |
| mail/index.ejs | MailPage | Composer/templates/SMTP/history exist; missing permission gates, mobile layout; do not send real email for parity testing |
| integrations/index.ejs | IntegrationsPage | Help panels exist; receiver/scheduler/clear/key-action and permission gaps |
| search/index.ejs + public/js/search.js | SearchPage, SearchModal | Search/filter/modal implementations exist; history isolation, URL state, keyboard/pagination/errors pending |
| audit/index.ejs | AuditPage | Table/filter exists; missing authorization and URL persistence |
| dashboard/reports-index.ejs | ReportsIndexPage | Index and links exist; open every report and saved module report |
| dashboard/report-table.ejs | ReportTablePage | Tables and CSV/PDF code paths exist; compare exact filters, row totals, formatting and export contents |
| dashboard/module-report-builder.ejs | ModuleReportBuilderPage | Blocked by confirmed route-shadowing 404; then verify grouping, field filters, save/load/delete and both CSV exports |
| dashboard/analytics.ejs | AnalyticsPage | Charts/filters present; Reset broken, theme and totals need same-data comparison |
| dashboard/portfolio.ejs | PortfolioPage | Overview/drilldowns present; Open dashboard missing and cross-workspace navigation must work |
| dashboard/clientDashboard.ejs | ClientDashboardPage | Portal and CSV/PDF exist; client landing/navigation missing; test company/month/date scope and export data as client role |
| errors/403.ejs, 404.ejs, 500.ejs | Error pages + ErrorBoundary | Pages exist; incorrect fallback icons; verify proper status/route behavior and distinguish API errors from render errors |

### What must pass before calling this a 100% migration

1. Close all confirmed P0/P1 findings, with a focused regression check for each repaired root cause and affected sibling route.
2. Use an isolated copy of representative CRM data. Match both apps' role, active workspace, records, stages, labels, custom fields, work modules, statuses and theme.
3. Test admin, manager, assigned agent, restricted custom role, view-only custom role and client; verify denied direct API requests as well as hidden buttons.
4. For each domain, exercise create/read/edit/status/assignment/delete-or-deactivate, filtering, sorting, pagination, saved state and every visible action. Compare persisted data and side effects after refresh, not just success messages.
5. Test two workspaces, two users in one browser, reload, Back/Forward and expired sessions. Verify that local storage preferences do not leak unwanted state between accounts/workspaces.
6. Validate import/export round trips and sparse updates with disposable fixtures; include all supported custom field types, quoted CSV, Excel, duplicate rules and follow-up/automation effects.
7. Compare rendered EJS and React screenshots at 1440px, 1024px, 768px and 375px, in each supported theme, including dialogs and empty/loading/error/long-content states.
8. Keep each checklist item marked **passed**, **failed**, or **not tested**, with evidence. Never turn “not tested” into “100% verified” because TypeScript/build passes.

## I. Relationship to existing gap documents and ownership

- `GAP_REPORT.md` says all domains are 100% functional and remaining work is optional. The reproduced report-route failures, schema mismatch, ignored import controls and absent permissions disprove that conclusion for this snapshot.
- `docs/REACT-MIGRATION-GAP-AUDIT.md` describes pin customization and company sections as missing. Those sections now exist; this report records their current behavior instead of reusing stale missing-page claims.
- The older audit calls work detail/subtasks and CSV verified complete. Their API/model and preview/execution mismatches remain.
- The master report's “multi-file” and fully accessible universal-dialog claims are stronger than the current implementation supports.
- Task contact links (WhatsApp/Call) already exist; do not reassign them as missing based on an older polish queue.
- The original and copied model/service/config/utils/middleware files matched in this audit. No backend model rewrite is needed merely to repair the new subtask API.
- A suspected production static-build path issue was checked and **rejected**: resolving `../../client/dist` from `server/src` correctly reaches the project `client/dist`. Do not add it to a fix list.
- `docs/package/OWNERSHIP.md` currently assigns Dashboard/Customers to OpenCode and Clients/other domains to Antigravity and says Codex departed. The user's current request authorizes this independent document; it does not require changing that ownership split or editing shared implementation files.

Suggested repair sequence: restore permission/data boundaries and sparse import preservation; repair work detail/subtasks and report routes; fix workspace/session/terminology/client context; finish dashboard saved-state behavior and imports; close remaining functional parity gaps; then perform visual and responsive sign-off. Keep repairs in the existing owners' domains with shared junction changes coordinated explicitly.

## J. Exact template inventory

The following inventory is generated from the original source tree so that partials and less-visible pages cannot disappear from the acceptance scope. Inventory inclusion is not a claim of runtime verification.
- `audit/index.ejs`
- `auth/login.ejs`
- `campaigns/index.ejs`
- `campaigns/show.ejs`
- `companies/index.ejs`
- `companies/show.ejs`
- `customers/detail.ejs`
- `customers/duplicates.ejs`
- `customers/form.ejs`
- `customers/import-preview.ejs`
- `customers/import-results.ejs`
- `customers/import.ejs`
- `customers/index.ejs`
- `dashboard/analytics.ejs`
- `dashboard/clientDashboard.ejs`
- `dashboard/index.ejs`
- `dashboard/module-report-builder.ejs`
- `dashboard/portfolio.ejs`
- `dashboard/report-table.ejs`
- `dashboard/reports-index.ejs`
- `errors/403.ejs`
- `errors/404.ejs`
- `errors/500.ejs`
- `integrations/index.ejs`
- `mail/index.ejs`
- `partials/footer.ejs`
- `partials/head.ejs`
- `partials/header.ejs`
- `partials/sidebar.ejs`
- `partials/topbar.ejs`
- `search/index.ejs`
- `settings/_work-type-builder.ejs`
- `settings/index.ejs`
- `settings/setup.ejs`
- `tasks/index.ejs`
- `team/index.ejs`
- `work/_category-fields.ejs`
- `work/_custom-fields.ejs`
- `work/_overview.ejs`
- `work/center.ejs`
- `work/detail.ejs`
- `work/import-preview.ejs`
- `work/index.ejs`
