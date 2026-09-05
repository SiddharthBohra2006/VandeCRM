# API Contracts — VandeCRM React

Every API endpoint, request shape, and response shape. This is the contract between backend and frontend. **Do not deviate from these shapes.**

Base URL: `/api`

---

## Auth

### POST /api/auth/login
**Request:** `{ email: string, password: string }`
**Response:**
```json
{
  "ok": true,
  "token": "jwt_token_here",
  "user": {
    "_id": "abc123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "admin",
    "organization": { "_id": "org1", "name": "My Org" },
    "dashboardHiddenSections": [],
    "dashboardHiddenCards": [],
    "dashboardCardOrder": [],
    "sidebarHiddenItems": []
  }
}
```

### POST /api/auth/signup
**Request:** `{ name, email, password, orgName }`
**Response:** Same as login.

### GET /api/auth/me
**Headers:** `Authorization: Bearer <token>`
**Response:**
```json
{
  "ok": true,
  "user": { ... },
  "companies": [
    { "_id": "comp1", "name": "Client A", "isMain": true }
  ],
  "activeCompany": { "_id": "comp1", "name": "Client A" },
  "crmTerms": {
    "leadSingular": "Lead",
    "leadPlural": "Leads",
    "recordSingular": "Client",
    "recordPlural": "Clients",
    "pipelineName": "Sales pipeline"
  },
  "workTypes": [
    { "_id": "wt1", "key": "video", "name": "Videos", "icon": "video", "color": "#64748b", "statuses": [...] }
  ]
}
```

### POST /api/auth/switch-company
**Request:** `{ companyId: string }`
**Response:** `{ ok: true, activeCompany: { ... } }`

---

## Dashboard

### GET /api/dashboard
**Query:** `?campaign=optional_campaign_id`
**Response:**
```json
{
  "ok": true,
  "stats": {
    "totalLeads": 45,
    "totalClients": 12,
    "newThisWeek": 8,
    "followupsDue": 3,
    "staleCustomers": 5,
    "openWork": 15,
    "completedWork": 23,
    "overdue": 2,
    "adSpend": 50000,
    "deliveredPercent": 75
  },
  "stageCards": [
    {
      "stage": { "_id": "s1", "name": "New Lead", "color": "#3b82f6" },
      "count": 10,
      "value": 250000,
      "customers": [ { "_id": "c1", "name": "Rahul", "value": 50000, ... } ]
    }
  ],
  "moduleStats": [
    {
      "key": "video",
      "name": "Videos",
      "icon": "video",
      "color": "#64748b",
      "total": 5,
      "open": 3,
      "completed": 2,
      "statuses": [{ "key": "in-progress", "label": "In Progress", "count": 2 }]
    }
  ],
  "upcomingDeadlines": [ { "_id": "rec1", "title": "Video Edit", "deadline": "2026-09-10", "workType": { "name": "Videos" } } ],
  "weeklyWorkProgress": [
    { "label": "Mon", "count": 2, "isToday": false },
    { "label": "Tue", "count": 0, "isToday": true }
  ],
  "recentCustomers": [ ... ],
  "attentionCustomers": [ ... ],
  "campaigns": [ ... ],
  "dashboardViews": [ ... ]
}
```

### POST /api/dashboard/preferences/sidebar
**Request:** `{ hiddenItems: string[] }`
**Response:** `{ ok: true }`

### POST /api/dashboard/preferences/dashboard
**Request:** `{ hiddenSections: string[], dashboardHiddenCards: string, dashboardCardOrder: string }`
**Response:** `{ ok: true, hiddenCards: [], cardOrder: [], hiddenSections: [] }`

### POST /api/dashboard/pipeline/move
**Request:** `{ customerId: string, stageId: string }`
**Response:** `{ ok: true }`

---

## Customers (Leads)

### GET /api/customers
**Query:** `?q=&stage=&label=&campaign=&sortBy=recent&view=all&dateFrom=&dateTo=&page=1&pageSize=10`
**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "_id": "c1",
      "name": "Rahul Sharma",
      "company": "Acme Corp",
      "email": "rahul@acme.com",
      "phone": "9876543210",
      "source": "Website",
      "value": 50000,
      "priority": "high",
      "leadScore": 80,
      "stage": { "_id": "s1", "name": "New Lead", "color": "#3b82f6" },
      "labels": [{ "_id": "l1", "name": "HP", "color": "#ef4444" }],
      "assignedTo": { "_id": "u1", "name": "John" },
      "clientCompany": { "_id": "comp1", "name": "Client A" },
      "campaign": { "_id": "camp1", "name": "Meta Campaign" },
      "notes": "Interested in package",
      "customData": { "course": "AI Bootcamp" },
      "nextFollowUpAt": "2026-09-05T10:00:00Z",
      "lastContactedAt": "2026-09-01T14:00:00Z",
      "createdAt": "2026-08-20T09:00:00Z",
      "updatedAt": "2026-09-01T14:00:00Z"
    }
  ],
  "stages": [ { "_id": "s1", "name": "New Lead", "color": "#3b82f6", "order": 1 } ],
  "labels": [ { "_id": "l1", "name": "HP", "color": "#ef4444" } ],
  "fields": [ { "_id": "f1", "key": "course", "label": "Course", "type": "text" } ],
  "companies": [ ... ],
  "campaigns": [ ... ],
  "users": [ ... ],
  "savedViews": [ ... ],
  "pagination": { "page": 1, "pageSize": 10, "totalPages": 5, "totalResults": 45 },
  "leadStats": { "totalLeads": 45, "newLeads": 8, "qualifiedLeads": 12, "hotLeads": 5, "overdueLeads": 3 }
}
```

### GET /api/customers/:id
**Response:**
```json
{
  "ok": true,
  "data": {
    "_id": "c1",
    "name": "Rahul Sharma",
    ...all customer fields populated...
  },
  "activities": [
    { "_id": "a1", "type": "note", "note": "Called lead", "user": { "name": "John" }, "createdAt": "..." }
  ],
  "attachments": [ ... ],
  "relatedWork": [ ... ],
  "fields": [ ... ]
}
```

### POST /api/customers
**Request:**
```json
{
  "name": "New Lead",
  "company": "Acme",
  "email": "lead@acme.com",
  "phone": "9876543210",
  "source": "Website",
  "value": 50000,
  "priority": "medium",
  "stage": "stage_id",
  "labels": ["label_id_1", "label_id_2"],
  "assignedTo": "user_id",
  "clientCompany": "company_id",
  "campaign": "campaign_id",
  "notes": "Notes here",
  "customData": { "key": "value" }
}
```
**Response:** `{ ok: true, data: { ...created customer... } }`

### PUT /api/customers/:id
**Request:** Same fields as POST (partial update)
**Response:** `{ ok: true, data: { ...updated customer... } }`

### DELETE /api/customers/:id
**Response:** `{ ok: true }`

### POST /api/customers/bulk
**Request:** `{ action: "stage"|"transfer"|"priority"|"value"|"source"|"delete", selectedIds: string[], stageId?, assignedTo?, priority?, value?, source? }`
**Response:** `{ ok: true, message: "5 leads moved to New Lead." }`

### GET /api/customers/export/csv
**Query:** `?dateFrom=&dateTo=&scope=leads|clients`
**Response:** CSV file download

### POST /api/customers/import/preview
**Request:** Multipart with CSV text
**Response:**
```json
{
  "ok": true,
  "preview": {
    "headers": [...],
    "totalRows": 100,
    "createCount": 80,
    "updateCount": 15,
    "skipCount": 5,
    "rows": [{ "rowNumber": 2, "status": "create", "name": "...", ... }]
  }
}
```

### POST /api/customers/import
**Request:** CSV data + settings
**Response:** `{ ok: true, imported: 80, updated: 15, skipped: 5 }`

---

## Clients

### GET /api/clients
Same shape as GET /api/customers but filtered to won stages only.

---

## Campaigns

### GET /api/campaigns
**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "_id": "camp1",
      "name": "Meta Jan Campaign",
      "platform": "Meta Ads",
      "status": "active",
      "budget": 100000,
      "spent": 50000,
      "leadsCount": 45,
      "clientCompany": { "_id": "comp1", "name": "Client A" },
      "metrics": {
        "totalLeads": 45,
        "pipelineValue": 250000,
        "wonRevenue": 100000,
        "costPerLead": 1111,
        "roi": 100
      }
    }
  ],
  "companies": [...],
  "stages": [...],
  "users": [...]
}
```

### GET /api/campaigns/:id
**Response:** `{ ok: true, data: { ...campaign with metrics... }, customers: [...] }`

### POST /api/campaigns
**Request:** `{ name, platform, clientCompany, objective, budget, startDate, endDate, ... }`
**Response:** `{ ok: true, data: { ...created campaign... } }`

### PUT /api/campaigns/:id
**Request:** Partial campaign fields
**Response:** `{ ok: true, data: { ...updated campaign... } }`

### POST /api/campaigns/:id/status
**Request:** `{ status: "active"|"paused"|"completed"|"archived" }`
**Response:** `{ ok: true }`

### DELETE /api/campaigns/:id
**Response:** `{ ok: true }`

---

## Work Module

### GET /api/work
**Response:**
```json
{
  "ok": true,
  "workTypes": [ ... ],
  "items": [ ... ],
  "counts": { "open": 15, "overdue": 2, "completed": 23 }
}
```

### GET /api/work/:type
**Query:** `?status=&assignedTo=&priority=&q=&page=1`
**Response:**
```json
{
  "ok": true,
  "workType": { ... },
  "data": [
    {
      "_id": "rec1",
      "title": "Video Edit for Client",
      "status": "in-progress",
      "priority": "high",
      "deadline": "2026-09-10",
      "assignedTo": { "_id": "u1", "name": "Editor" },
      "collaborators": [...],
      "workType": { ... },
      "customFields": { ... },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "companies": [...],
  "users": [...],
  "relatedItems": [...],
  "customers": [...],
  "pagination": { ... }
}
```

### GET /api/work/:type/:id
**Response:**
```json
{
  "ok": true,
  "data": { ...full work item populated... },
  "subtasks": [ ... ],
  "auditLog": [ ... ],
  "users": [...]
}
```

### POST /api/work/:type
**Request:** `{ title, clientCompany, assignedTo, status, priority, deadline, notes, customFields: {...}, relatedRecords: [...] }`
**Response:** `{ ok: true, data: { ...created record... } }`

### PUT /api/work/:type/:id
**Request:** Partial work item fields
**Response:** `{ ok: true, data: { ...updated record... } }`

### POST /api/work/:type/:id/status
**Request:** `{ status: "new-status-key" }`
**Response:** `{ ok: true }`

### DELETE /api/work/:type/:id
**Response:** `{ ok: true }`

### POST /api/work/:type/:id/subtasks
**Request:** `{ title, assignedTo, status, priority, deadline }`
**Response:** `{ ok: true, data: { ...subtask... } }`

---

## Team

### GET /api/team
**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "_id": "u1",
      "name": "John",
      "email": "john@example.com",
      "role": "admin",
      "isActive": true,
      "customRole": { ... },
      "assignedCompanies": ["comp1"],
      "lastLoginAt": "..."
    }
  ],
  "companies": [...],
  "customRoles": [...],
  "workTypes": [...]
}
```

### POST /api/team
**Request:** `{ name, email, password, role, customRole, assignedCompanies }`
**Response:** `{ ok: true, data: { ...user without password... } }`

### POST /api/team/:id
**Request:** `{ name, role, customRole, hiddenModules, assignedCompanies, password? }`
**Response:** `{ ok: true }`

### POST /api/team/:id/status
**Request:** `{ isActive: true|false }`
**Response:** `{ ok: true }`

---

## Settings

### GET /api/settings
**Response:**
```json
{
  "ok": true,
  "stages": [...],
  "labels": [...],
  "fields": [...],
  "workTypes": [...],
  "automations": [...],
  "users": [...],
  "organization": { "name": "My Org", "theme": {...} }
}
```

### POST /api/settings/stages
**Request:** `{ name, key, color, order, isWon, isLost, isDefault }`
**Response:** `{ ok: true, data: { ...stage... } }`

### POST /api/settings/stages/:id
**Request:** Partial stage fields
**Response:** `{ ok: true }`

### POST /api/settings/stages/reorder
**Request:** `{ stages: [{ id: "s1", order: 1 }, ...] }`
**Response:** `{ ok: true }`

### POST /api/settings/labels
**Request:** `{ name, isHighPotential, color }`
**Response:** `{ ok: true, data: { ...label... } }`

### POST /api/settings/labels/:id
**Request:** Partial label fields
**Response:** `{ ok: true }`

### POST /api/settings/fields
**Request:** `{ label, key, type, options, required, order }`
**Response:** `{ ok: true, data: { ...field... } }`

### POST /api/settings/fields/:id
**Request:** Partial field fields
**Response:** `{ ok: true }`

### POST /api/settings/terminology
**Request:** `{ leadSingular, leadPlural, recordSingular, recordPlural, pipelineName }`
**Response:** `{ ok: true }`

### POST /api/settings/theme
**Request:** `{ gold, teal, background, surface, text }`
**Response:** `{ ok: true }`

### POST /api/settings/work-types
**Request:** `{ name, key, icon, color, statuses, fields, presentation }`
**Response:** `{ ok: true, data: { ...workType... } }`

### POST /api/settings/work-types/:id
**Request:** Partial work type fields
**Response:** `{ ok: true }`

### DELETE /api/settings/work-types/:id
**Response:** `{ ok: true }`

### POST /api/settings/automations
**Request:** `{ entityType, trigger, action, target, config }`
**Response:** `{ ok: true, data: { ...automation... } }`

### POST /api/settings/automations/:id/toggle
**Response:** `{ ok: true }`

### DELETE /api/settings/automations/:id
**Response:** `{ ok: true }`

---

## Companies

### GET /api/companies
**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "_id": "comp1",
      "name": "Client A",
      "status": "active",
      "isMain": true,
      "website": "...",
      "healthStatus": "healthy",
      "leadCount": 45,
      "campaignCount": 3,
      "assignedUsers": [{ "_id": "u1", "name": "John" }]
    }
  ]
}
```

### GET /api/companies/:id
**Response:**
```json
{
  "ok": true,
  "data": { ...full company... },
  "customers": [...],
  "campaigns": [...],
  "stages": [...],
  "activities": [...]
}
```

### POST /api/companies
**Request:** `{ name, website, category, contactPerson, phone, email, ... }`
**Response:** `{ ok: true, data: { ...company... } }`

### PUT /api/companies/:id
**Request:** Partial company fields
**Response:** `{ ok: true }`

### POST /api/companies/switch
**Request:** `{ companyId: string }`
**Response:** `{ ok: true, activeCompany: { ... } }`

### POST /api/companies/:id/collaborators
**Request:** `{ userIds: string[] }`
**Response:** `{ ok: true }`

---

## Follow-ups

### GET /api/follow-ups
**Query:** `?filter=due|today|upcoming|all`
**Response:**
```json
{
  "ok": true,
  "followUps": [ { ...customer with nextFollowUpAt populated... } ],
  "completedFollowUps": [...],
  "stats": { "due": 3, "today": 2, "upcoming": 5, "all": 10 },
  "view": "due"
}
```

### POST /api/follow-ups/:id/complete
**Response:** `{ ok: true }`

### POST /api/follow-ups/:id/reschedule
**Request:** `{ nextFollowUpAt: "2026-09-10T10:00:00Z", comment: "optional" }`
**Response:** `{ ok: true }`

---

## Mail

### GET /api/mail
**Response:**
```json
{
  "ok": true,
  "accounts": [...],
  "templates": [...],
  "customers": [...],
  "messages": [...]
}
```

### POST /api/mail/settings
**Request:** `{ host, port, secure, user, password }`
**Response:** `{ ok: true }`

### POST /api/mail/templates
**Request:** `{ name, subject, body, category }`
**Response:** `{ ok: true, data: { ...template... } }`

### POST /api/mail/send
**Request:** `{ customerId, subject, body, templateId? }`
**Response:** `{ ok: true }`

---

## Notifications

### GET /api/notifications/feed
**Response:** `{ ok: true, count: 5 }`

### POST /api/notifications/:id/read
**Response:** `{ ok: true }`

### POST /api/notifications/read-all
**Response:** `{ ok: true }`

---

## Integrations

### GET /api/integrations
**Response:**
```json
{
  "ok": true,
  "companies": [...],
  "syncLogs": [...],
  "dueCompanies": [...]
}
```

### POST /api/integrations/companies/:id/credentials
**Request:** `{ metaAccessToken, ga4ServiceAccountJson, metaAdAccountId, ga4PropertyId }`
**Response:** `{ ok: true }`

### POST /api/integrations/sync
**Response:** `{ ok: true, summary: "..." }`

---

## Audit

### GET /api/audit
**Query:** `?action=&entityType=&user=&page=1`
**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "_id": "a1",
      "action": "stage_drag_drop",
      "entityType": "customer",
      "entityName": "Rahul",
      "message": "Stage changed to Qualified",
      "user": { "name": "John" },
      "createdAt": "..."
    }
  ],
  "filters": { "actions": [...], "entityTypes": [...], "users": [...] },
  "pagination": { ... }
}
```

---

## Search

### GET /api/search
**Query:** `?q=search+term`
**Response:**
```json
{
  "ok": true,
  "quickStats": { "followups": 3, "openTasks": 5, "todayActivities": 2, "unreadNotifications": 1 },
  "results": {
    "leads": [...],
    "clients": [...],
    "work": [...],
    "activities": [...],
    "team": [...],
    "campaigns": [...],
    "companies": [...]
  }
}
```
