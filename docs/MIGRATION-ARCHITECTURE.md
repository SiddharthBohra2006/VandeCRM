# Migration Architecture — VandeCRM React

## Overview

This document is the **single source of truth** for all developers working on the EJS → React migration. Read this first. Reference it often. Do not make assumptions beyond what's written here.

## What We're Doing

Converting a server-rendered Express/EJS CRM into a React SPA with a JSON API backend. The existing Express backend stays — we add API routes alongside EJS routes. The React frontend consumes those API routes.

**Constraints:**
- Same functionality, same UI layout, same behavior
- No visual changes in this phase — pixel parity with EJS version
- TypeScript throughout the React app
- The EJS app continues to work during migration (both coexist)

## Project Structure

```
D:\vandecrmreact\
├── client/                    # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── api/               # API client functions (one file per domain)
│   │   ├── components/        # Shared/reusable components
│   │   ├── layouts/           # AppLayout, AuthLayout
│   │   ├── pages/             # One folder per route domain
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── customers/
│   │   │   ├── clients/
│   │   │   ├── campaigns/
│   │   │   ├── work/
│   │   │   ├── team/
│   │   │   ├── settings/
│   │   │   ├── companies/
│   │   │   ├── tasks/
│   │   │   ├── mail/
│   │   │   ├── integrations/
│   │   │   ├── audit/
│   │   │   └── search/
│   │   ├── hooks/             # Custom React hooks
│   │   ├── types/             # TypeScript interfaces
│   │   ├── utils/             # Helper functions
│   │   ├── App.tsx            # Router setup
│   │   └── main.tsx           # Entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── server/                    # Express backend (adapted)
│   ├── src/
│   │   ├── api/               # NEW: API route handlers (JSON)
│   │   │   ├── middleware/     # JWT auth, API validators
│   │   │   ├── auth.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── customers.ts
│   │   │   ├── clients.ts
│   │   │   ├── campaigns.ts
│   │   │   ├── work.ts
│   │   │   ├── team.ts
│   │   │   ├── settings.ts
│   │   │   ├── companies.ts
│   │   │   ├── tasks.ts
│   │   │   ├── mail.ts
│   │   │   ├── notifications.ts
│   │   │   ├── integrations.ts
│   │   │   ├── audit.ts
│   │   │   └── search.ts
│   │   ├── config/            # Copied from original (unchanged)
│   │   ├── middleware/        # Copied from original (unchanged)
│   │   ├── models/            # Copied from original (unchanged)
│   │   ├── routes/            # Copied from original (unchanged, EJS)
│   │   ├── services/          # Copied from original (unchanged)
│   │   └── utils/             # Copied from original (unchanged)
│   └── server.ts              # Entry point (adapted from server.js)
├── docs/                      # This folder — shared architecture docs
│   ├── MIGRATION-ARCHITECTURE.md
│   ├── API-CONTRACTS.md
│   ├── REACT-PATTERNS.md
│   ├── CODEX-TASKS.md
│   └── ANTIGRAVITY-TASKS.md
└── README.md
```

## How the Two Coexist

```
Browser → React App (port 5173 dev / served from /client/build prod)
  ↓ API calls
Express Server (port 5000)
  ├── /api/* → JSON API routes (NEW)
  ├── /auth/* → EJS auth routes (EXISTING)
  ├── /* → EJS page routes (EXISTING)
  └── Serves React build in production
```

In development: React runs on Vite dev server (5173), proxies API calls to Express (5000).
In production: Express serves the React build as static files.

## Shared Code Between Original and New

These folders are **copied as-is** from `D:\VandeAgencyCRM\src\`:
- `models/` — All 24 Mongoose models. Zero changes.
- `services/` — All 11 service modules. Zero changes.
- `utils/` — All utility functions. Zero changes.
- `config/` — roles.js. Zero changes.
- `middleware/` — auth.js, csrf.js, security.js, etc. Zero changes.

These are **adapted** (not copied):
- `server.js` → `server.ts` — Add CORS, serve React build, mount API routes
- `routes/` — Keep for EJS, but API routes go in `src/api/`

## API Route Pattern

Every API route follows this exact pattern:

```typescript
// src/api/customers.ts
import { Router } from 'express';
import { requireApiAuth } from './middleware/auth';
import Customer from '../../models/Customer';
// ... other models

const router = Router();

// GET /api/customers — List customers
router.get('/', requireApiAuth, async (req, res) => {
  try {
    const organization = req.user!.organization._id;
    const { q, stage, label, campaign, sortBy, page, pageSize } = req.query;
    
    // Build filter (same logic as EJS route)
    const filter: any = { organization, clientCompany: req.activeCompanyId };
    // ... apply filters
    
    // Query
    const customers = await Customer.find(filter)
      .populate('stage labels assignedTo clientCompany campaign')
      .sort(sortObj)
      .skip((page - 1) * pageSize)
      .limit(pageSize);
    
    const total = await Customer.countDocuments(filter);
    
    // Return JSON (NOT render)
    res.json({
      ok: true,
      data: customers,
      pagination: { page, pageSize, totalPages: Math.ceil(total / pageSize), totalResults: total }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch customers' });
  }
});

export default router;
```

## Response Format

Every API response uses this envelope:

```json
{
  "ok": true,
  "data": { ... },        // or "data": [...]
  "pagination": { ... }   // only on list endpoints
}
```

Error responses:
```json
{
  "ok": false,
  "error": "Error message"
}
```

## Auth Flow

1. React app sends POST `/api/auth/login` with `{ email, password }`
2. Server validates, returns `{ ok: true, token: "jwt...", user: { ... } }`
3. React stores token in localStorage
4. All subsequent API requests include `Authorization: Bearer <token>` header
5. `requireApiAuth` middleware decodes JWT, attaches `req.user` and `req.activeCompanyId`

## Key Decisions

- **No state management library** — React Context + useState is enough. Add Zustand only if needed.
- **No component library** — Custom CSS matching existing EJS styles. Copy CSS from original.
- **Fetch API** — No axios. Just fetch with a thin wrapper.
- **React Router v6** — File-based-ish routing, explicit route definitions.
- **No SSR** — Pure SPA. First load may be slightly slower, but simplifies everything.

## What NOT to Change

- Do not modify any file in `models/`, `services/`, `utils/`, `config/`, `middleware/`
- Do not change the EJS routes — they continue working
- Do not change the database schema
- Do not add new npm dependencies to the server without discussion
- Do not change the UI layout or design in this phase
