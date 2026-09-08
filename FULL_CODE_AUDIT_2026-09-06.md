# VandeCRM React — Verified Code Audit

**Repository reviewed:** `D:\vandecrmreact`  
**Review date:** 06 September 2026  
**Basis:** Current working tree, including uncommitted changes. This report does not assume that `GAP_REPORT.md` is current.

## Executive assessment

**Overall production-readiness rating: 5.5/10.**

The application is a substantial, buildable CRM rather than a prototype. It has 41 React pages, 19 API routers, roughly 38,000 JavaScript/TypeScript source lines, multi-workspace data models, RBAC, configurable work types, lead imports, follow-ups, reporting, mail, integrations, audit records, and deployment support. The current client build and all server JavaScript syntax checks pass.

The rating is held down by authorization and workspace-scope gaps in team, mail, and company APIs; a broken public lead-integration contract; plaintext/loggable API keys; race-prone lead assignment; and the absence of an automated regression suite. These are production issues, not cosmetic preferences.

| Area | Rating | Reason |
|---|---:|---|
| Functional breadth | 8/10 | Broad CRM, work, reporting, configuration, mail, and integration coverage. |
| Backend/data design | 7/10 | Good organization/workspace scoping in many routes, encryption for stored provider credentials, indexes, audit logging, and explicit role helpers. |
| Security/authorization | 4/10 | Confirmed privilege escalation, restricted-mail scope leaks, plaintext API keys, and secret logging. |
| Reliability/testing | 4/10 | Buildable and syntax-clean, but no committed test/spec files and several concurrency/validation gaps. |
| Mobile/performance | 5/10 | Mobile drawer exists, but breakpoint sprawl and a 994 KB minified single JS bundle remain. |
| White-label/customization | 6/10 | Organization terminology and app title exist, but guest/auth screens remain source-hardcoded to VandeCRM. |

## Verification performed

- `npm run build` in `client`: **passed** using the repository toolchain; 1,920 modules transformed.
- Production output: `994.34 kB` JavaScript (`234.52 kB` gzip), `535.88 kB` CSS (`84.40 kB` gzip), with Vite's chunk-size warning.
- `node --check` across every `server/src/**/*.js` file: **passed**.
- Current `npm audit`: server/root has **3 moderate** findings (`express`/`body-parser`/`qs` chain); client has **1 high and 3 moderate** findings (`vite`, `esbuild`, `react-router`, `react-router-dom`).
- No test/spec files were found outside `node_modules`. Neither package defines a test, lint, or format script.
- Six CSS files contain **28 distinct pixel breakpoint values**: 480 through 1280 px, including adjacent values such as 760/761 and 1100/1101.
- `node_modules` is present locally but is not tracked by Git. Its presence is a delivery/package hygiene issue only if it is included in future archives.

## Confirmed findings

### P0 — fix before exposing the system to normal staff or external lead sources

#### SEC-01: Team-create permission can produce a manager or an effectively privileged custom role

`server/src/config/roles.js:57` allows every non-admin actor to assign every role except literal `admin`. `server/src/api/team.js:157` uses that result when creating a user, so an actor with `team.create` can create a built-in `manager`. Managers receive broad module permissions in `roles.js:68`.

The same actor can create a custom role with arbitrary submitted permissions and organization-wide scope at `server/src/api/team.js:540-557`, then assign that role while creating a member at `team.js:158-167`. CSV import repeats the built-in role path at `team.js:410-492`.

**Impact:** A delegated team administrator can grant access far beyond team administration, including business records and settings. This is a privilege-escalation path.

**Smallest safe fix:** Only admins may assign `admin` or `manager`, create/update/delete custom roles, or assign a custom role containing permissions the actor does not possess. Add focused route-level assertions for create, update, role creation, and CSV import.

#### SEC-02: Restricted mail users can read and send outside their assigned lead scope

`server/src/api/mail.js:19` requires `mail.view`, and `mail.js:63` scopes the recipient picker for restricted users. However, `mail.js:68` returns the organization's latest email messages without customer/workspace/assignee filtering. More seriously, `POST /send` at `mail.js:103-108` looks up the target by `{ _id, organization }`, bypassing `getCustomerFilter` and the active workspace.

**Impact:** A restricted user with mail permission can read message metadata/content for other teams' leads and can send email to any customer in the organization if they obtain an ID.

**Smallest safe fix:** Use the same customer-scope helper for both message listing and send lookup, include `clientCompany: req.activeCompanyId`, and filter message history by accessible customer IDs.

#### INT-01: The integration page documents an endpoint and header the backend does not implement

`client/src/pages/integrations/IntegrationsPage.tsx:261` displays `/api/v1/leads`. Its examples use `X-API-Key` at lines 648 and 665. The only server handler is `POST /api/inbound-lead` at `server/src/routes/api.js:31`, and it reads `x-company-api-key` at line 42.

**Impact:** Copying either integration example results in a 404 or “API Key is missing.” External lead capture cannot work from the documented UI.

**Smallest safe fix:** Choose one public contract and use it everywhere. The lowest-risk change is to make the server accept the documented route/header while temporarily retaining the old aliases for compatibility.

#### SEC-03: Inbound API keys are stored and logged as reusable plaintext secrets

`server/src/models/ClientCompany.js:38` stores `apiKey` directly. Authentication queries it directly at `server/src/routes/api.js:48`. The route also accepts it in a URL query parameter at line 42 and logs a rejected key verbatim at line 51. Key generation uses 24 random bytes, so entropy is not the problem.

**Impact:** A database snapshot, rejected-request log, proxy history, browser history, or analytics capture can expose a credential that grants lead-write access.

**Smallest safe fix:** Store a SHA-256 digest plus a short display suffix; show the raw key only when created/rotated; accept secrets only through a named header; redact all authentication failures. Existing keys need a controlled one-time migration or rotation.

### P1 — fix before calling the CRM production-ready

#### AUTH-01: Company listing leaks organization-wide workspace and user metadata to specialist/custom assigned roles

`server/src/api/companies.js:78-85` restricts the list only when `req.user.role === 'agent'`. Specialist roles and custom roles with assigned scope pass the `businesses.view` middleware but receive every company plus the organization's active-user list. The detail route has the stronger `canAccessCompany` check at `companies.js:22` and `:118`, so list and detail disagree.

**Impact:** Restricted staff can enumerate companies and staff relationships that they cannot open individually.

**Smallest safe fix:** Derive list scope from `isRestrictedUser(req.user)` or the same `canAccessCompany` rule, and return only users needed for accessible companies.

#### AUTH-02: Lead transfer accepts an invalid assignee ID

`server/src/api/customers.js:839` checks whether the requested user exists in the organization, but `customers.js:845` assigns the submitted ID even when no matching user was found.

**Impact:** Managers can leave leads assigned to nonexistent, inactive, client, or cross-organization IDs, breaking ownership filters and reporting.

**Smallest safe fix:** Reject a non-empty `assignedTo` unless it resolves to an eligible active internal user; assign the resolved user's `_id`, not the raw request value.

#### AUTH-03: Work field permissions are enforced on update but not creation

`server/src/api/work.js:406-465` uses `canEditWorkField` for updates. Creation at `work.js:337-403` accepts status, priority, dates, notes, customer, collaborators, secondary assignee, related records, and arbitrary custom fields after checking only module-level `create` permission.

**Impact:** A custom/specialist role can set fields during creation that it is forbidden to change later, undermining field-level policy.

**Smallest safe fix:** Apply one shared field-filter/validation function to create and update. Keep required server defaults independent of submitted fields.

#### REL-01: Round-robin inbound lead assignment is not atomic

`server/src/routes/api.js:174-182` reads `lastAssignedAgentIndex`, chooses a user, mutates the loaded company, and saves it. Concurrent requests can read the same index and select the same person.

**Impact:** Bursty lead ingestion produces unfair or duplicate assignment and inaccurate rotation state.

**Smallest safe fix:** Reserve the next index with one atomic database update and use the returned previous/current value. Also filter routing candidates to active eligible staff.

#### DATA-01: Applying a preset mutates data before deciding whether the request is allowed

`server/src/api/settings.js:94-100` deletes onboarding/demo records before checking whether any leads remain. If real leads exist, the route returns an error after already deleting demo data.

**Impact:** A rejected “apply preset” request can still change the workspace.

**Smallest safe fix:** Determine whether non-demo leads exist first, return without mutation if so, then remove demo data and replace configuration.

#### REL-02: Work creation accepts invalid dates and unvalidated relationships

`server/src/api/work.js:355-356` constructs dates without checking `isNaN`. The create path validates the primary assignee but sends raw customer, collaborators, secondary assignee, and related-record IDs into the model. The update path likewise assigns relationship IDs after field permission checks without the same eligibility validation used by delegation/subtasks.

**Impact:** Invalid dates become server errors, and stale/cross-workspace references can enter records or fail unpredictably at save/populate time.

**Smallest safe fix:** Reuse the existing assignment/reference validation already used by delegation and subtask creation; reject invalid dates with 400 responses.

### P2 — operational quality and maintainability

#### UI-01: Guest authentication branding is not white-label capable

`client/src/layouts/AuthLayout.tsx:11,60` and `client/src/pages/auth/LoginPage.tsx:96,102` hardcode “VandeCRM.” Tenant branding is available only after authentication (`AuthContext.tsx:118-120` updates the document title from the organization).

**Impact:** The first screen cannot reflect a customer's brand without rebuilding the frontend.

**Practical decision:** If one shared login serves all organizations, use neutral product branding. If each tenant has a hostname or slug, add a small public branding endpoint keyed by that stable tenant identifier. An email address cannot safely determine branding before login without leaking tenant membership.

#### PERF-01: No route-level code splitting

The production build emits one 994.34 kB minified JavaScript bundle. No `React.lazy`/dynamic route imports were found.

**Impact:** Mobile and first-time users download code for all 41 pages before using one route.

**Smallest safe fix:** Lazy-load page modules at route boundaries in `App.tsx`. Do not introduce a new state or bundling framework.

#### UI-02: Responsive breakpoints are fragmented

The six CSS files use 28 distinct breakpoint values, including one-pixel boundaries. The mobile drawer exists, so this is maintainability and dead-zone risk rather than proof that every mobile page is broken.

**Smallest safe fix:** Consolidate new and touched rules around a small documented set (for example 480, 768, 1024, 1200) during page fixes. A wholesale CSS rewrite is unnecessary.

#### DEP-01: Current dependency advisories need upgrades and regression checks

The 06 September audit reports one high and three moderate client findings and three moderate server findings. Vite and React Router fixes shown by npm require major-version upgrades from the currently pinned lines; they should not be applied blindly.

**Smallest safe fix:** Upgrade server dependencies first where a compatible fix exists. Plan Vite/React Router upgrades separately, run the production build, and smoke-test navigation, redirects, imports, and dev-server exposure.

#### QA-01: No durable automated test/lint gate

There are no repository test/spec files and no test/lint scripts. Existing historical verification scripts referenced elsewhere are not a repeatable suite in this repository.

**Impact:** Permission, import, and workspace regressions can pass typecheck/build because those tools do not exercise behavior.

**Smallest safe fix:** Start with a small Node assertion suite for the P0/P1 routes: team privilege boundaries, mail scope, inbound contract, round-robin reservation, work create/update field policy, and transfer validation. Add linting only after correctness checks are in place.

## Verified healthy behavior

- The current TypeScript/Vite production build passes on the repository toolchain.
- All server JavaScript parses successfully.
- JWT startup fails closed when secrets are missing; production startup checks required configuration (`server/src/server.js:5-12,87-95`).
- Password and password-reset fields plus encrypted credential fields are removed from JSON responses by `server/src/api/middleware/responsePrivacy.js`.
- Stored SMTP, Meta, and GA4 credentials use the encryption service rather than plaintext response fields.
- Customer detail, update, activity, attachments, duplicate merge, and deletion generally use organization/workspace scope. Current uncommitted changes also re-home related work/email records during merge and remove them during deletion.
- Work updates now apply field-level permissions; task delegation preserves history and generates audit/notification records.
- Recurring/monthly work records have unique indexes and upsert-based creation in the current working tree, addressing duplicate-generation races in that path.
- Authentication has rate limiting and non-enumerating password-recovery responses.
- The CRM supports useful operational foundations: lead follow-ups, activity types for calls/meetings/messages, work delegation history, configurable work modules, dashboard/report views, import/export, and notification scheduling.

## Business-usage gaps

These are gaps relative to operating a sales/agency team; they are not all software defects.

1. **Lead-capture reliability is currently blocked by INT-01.** Fix and test a real request from an external form before advertising webhook ingestion.
2. **No first-response SLA measurement.** The system records creation, activity, last contact, and follow-up dates, but does not calculate time-to-first-contact or alert when a fresh lead is untouched. This is the most useful next sales metric.
3. **Meeting tracking is activity-based.** Client/internal meeting types and recording links exist, and configurable work calendars exist, but there is no dedicated scheduling/attendance/reminder lifecycle. Add one only if the team will actually schedule meetings inside the CRM rather than Google Calendar.
4. **Delegation is implemented but acceptance is implicit.** Forwarding, assignment history, completion/rejection statuses, audit events, and notifications exist. There is no explicit “accept handoff” state or SLA. Add it only if ownership disputes occur in real use.
5. **Mail is outbound-only.** SMTP sending and sent-message history exist; inbound thread synchronization, replies, bounces, delivery/open status, and provider webhooks do not.
6. **Revenue figures are operational estimates.** Lead values, monthly packages, campaign spend, and conversion counts support dashboards, but they are not an accounting ledger and are not reconciled to invoices/payments.
7. **Schedulers are single-process timers.** Deadline and integration jobs run inside the web process. Multiple server replicas can duplicate work unless the jobs use durable database claims; a sleeping/free-tier instance can miss timing. Keep one worker for now and add durable job ownership when deployment topology requires it.

## Prioritized fix plan

### Phase 1 — access and integration contract

1. Lock manager/custom-role creation and assignment to admins; cover direct create, update, CSV import, and role endpoints.
2. Scope mail history and sending to the active workspace and the user's accessible leads.
3. Align the inbound route/header shown in the UI with the server; remove query-key support and redact failure logs.
4. Migrate inbound keys to digest-only storage with one-time display/rotation.

### Phase 2 — data integrity

5. Make round-robin reservation atomic and exclude inactive/ineligible users.
6. Reject invalid lead-transfer assignees.
7. Apply field/reference/date validation consistently to work creation and updates.
8. Move preset eligibility checks before deletion.
9. Correct company-list scope for every restricted role type.

### Phase 3 — delivery quality

10. Add focused Node-based API/permission regression checks for phases 1–2.
11. Lazy-load route pages and compare bundle output.
12. Consolidate breakpoints only while fixing verified mobile pages; test 390, 768, 1024, and desktop widths.
13. Upgrade dependencies in controlled groups and repeat build, syntax, route, and navigation checks.
14. Choose neutral shared-login branding or define a tenant hostname/slug contract.

## Release recommendation

Do not expose team-role administration or the inbound lead API to normal production users until SEC-01 through SEC-03 and INT-01 are fixed. Internal evaluation with trusted admins is reasonable because the application builds and its major workflows are present. After phase 1 and focused regression checks pass, reassess the rating; the likely next bottleneck will be live end-to-end acceptance across roles and mobile widths rather than missing feature breadth.

## Scope and limits

- This was source/build/dependency inspection of the current local working tree. No production database or external Meta/GA4/SMTP account was used.
- No destructive CRUD action was executed and no live email/webhook request was sent.
- Browser visual acceptance was not repeated in this pass; mobile conclusions are based on code/CSS and the earlier supplied audit evidence.
- The worktree already contained extensive uncommitted changes. This audit did not modify application source files.
