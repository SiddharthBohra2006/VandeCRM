# React Patterns — VandeCRM React

This document defines the exact patterns every React developer must follow. Copy these patterns. Do not invent new ones.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for build
- **React Router v6** for routing
- **Plain CSS** matching existing EJS styles (copy from original project)
- **No component library** — custom components matching existing UI
- **Fetch API** with thin wrapper (no axios)

## File Naming

```
pages/
  customers/
    CustomersPage.tsx      # Main list page
    CustomerDetailPage.tsx  # Detail/view page
    CustomerFormPage.tsx    # Create/edit form
  dashboard/
    DashboardPage.tsx
```

One component per file. File name = component name. Always `.tsx`.

## API Client Pattern

`client/src/api/client.ts`:
```typescript
const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('crm_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

`client/src/api/customers.ts`:
```typescript
import { api } from './client';

export interface Customer {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  value: number;
  priority: 'low' | 'medium' | 'high';
  leadScore: number;
  stage: { _id: string; name: string; color: string };
  labels: { _id: string; name: string; color: string }[];
  assignedTo: { _id: string; name: string } | null;
  clientCompany: { _id: string; name: string } | null;
  campaign: { _id: string; name: string } | null;
  notes: string;
  customData: Record<string, any>;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  ok: true;
  data: T[];
  pagination: { page: number; pageSize: number; totalPages: number; totalResults: number };
  [key: string]: any;
}

export const customersApi = {
  list: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return api.get<PaginatedResponse<Customer>>(`/customers?${query}`);
  },
  get: (id: string) => api.get<{ ok: true; data: Customer }>(`/customers/${id}`),
  create: (data: Partial<Customer>) => api.post<{ ok: true; data: Customer }>('/customers', data),
  update: (id: string, data: Partial<Customer>) => api.put<{ ok: true; data: Customer }>(`/customers/${id}`, data),
  delete: (id: string) => api.delete<{ ok: true }>(`/customers/${id}`),
};
```

## Page Component Pattern

Every page follows this structure:

```tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { customersApi, Customer } from '../../api/customers';

export default function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, totalPages: 1, totalResults: 0 });

  useEffect(() => {
    loadCustomers();
  }, [searchParams]);

  async function loadCustomers() {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      searchParams.forEach((value, key) => { params[key] = value; });
      const result = await customersApi.list(params);
      setCustomers(result.data);
      setPagination(result.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="page-container">
      {/* Exact same HTML structure as EJS template */}
      {/* Use same CSS class names */}
    </div>
  );
}
```

## Form Pattern

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customersApi } from '../../api/customers';

export default function CustomerFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', company: '', email: '', phone: '', source: '', value: 0,
    priority: 'medium', stage: '', notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      await customersApi.create(form);
      navigate('/customers');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Same form structure as EJS template */}
      <input name="name" value={form.name} onChange={handleChange} />
      {error && <div className="error-message">{error}</div>}
      <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
    </form>
  );
}
```

## Auth Context Pattern

```tsx
// client/src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/client';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  organization: { _id: string; name: string };
}

interface AuthState {
  user: User | null;
  token: string | null;
  companies: any[];
  activeCompany: any;
  crmTerms: any;
  workTypes: any[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchCompany: (companyId: string) => Promise<void>;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('crm_token'));
  const [companies, setCompanies] = useState<any[]>([]);
  const [activeCompany, setActiveCompany] = useState<any>(null);
  const [crmTerms, setCrmTerms] = useState<any>({});
  const [workTypes, setWorkTypes] = useState<any[]>([]);

  useEffect(() => {
    if (token) loadUser();
  }, []);

  async function loadUser() {
    try {
      const res = await api.get<any>('/auth/me');
      setUser(res.user);
      setCompanies(res.companies);
      setActiveCompany(res.activeCompany);
      setCrmTerms(res.crmTerms);
      setWorkTypes(res.workTypes);
    } catch {
      logout();
    }
  }

  async function login(email: string, password: string) {
    const res = await api.post<any>('/auth/login', { email, password });
    localStorage.setItem('crm_token', res.token);
    setToken(res.token);
    setUser(res.user);
    await loadUser();
  }

  function logout() {
    localStorage.removeItem('crm_token');
    setToken(null);
    setUser(null);
  }

  async function switchCompany(companyId: string) {
    const res = await api.post<any>('/auth/switch-company', { companyId });
    setActiveCompany(res.activeCompany);
    await loadUser();
  }

  return (
    <AuthContext.Provider value={{ user, token, companies, activeCompany, crmTerms, workTypes, login, logout, switchCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

## Routing Pattern

```tsx
// client/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import CustomersPage from './pages/customers/CustomersPage';
// ... other imports

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/auth/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/signup" element={<SignupPage />} />
          </Route>
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/new" element={<CustomerFormPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/work" element={<WorkCenterPage />} />
            <Route path="/work/:type" element={<WorkListPage />} />
            <Route path="/work/:type/:id" element={<WorkDetailPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/follow-ups" element={<FollowUpsPage />} />
            <Route path="/mail" element={<MailPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/search" element={<SearchPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

## Layout Pattern

```tsx
// client/src/layouts/AppLayout.tsx
import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';

export default function AppLayout() {
  const { user, activeCompany, companies, crmTerms, workTypes, switchCompany } = useAuth();

  return (
    <div className="app-layout">
      <Sidebar user={user} activeCompany={activeCompany} workTypes={workTypes} crmTerms={crmTerms} />
      <div className="main-content">
        <TopBar user={user} activeCompany={activeCompany} companies={companies} onSwitchCompany={switchCompany} />
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

## CSS Strategy

The original design system is ALREADY imported into the React client. **Do NOT copy CSS again and do NOT re-invent styles.**

**How it works:**
1. The original stylesheets live in `client/src/styles/` (copied from `D:\VandeAgencyCRM\public\css\`):
   - `app.css` — the full branded design system (gold/teal theme, Inter + Plus Jakarta Sans, all layout classes)
   - `auth.css` — public login/signup shell
   - `lead-detail.css`, `search.css` — page-specific styles
2. `client/src/index.css` imports all four and adds ONLY thin React glue (dropdowns, bell, stat cards, form cards, button modifiers aliased to theme vars).
3. `main.tsx` imports `index.css`. Vite bundles everything.
4. `AuthContext` applies the org theme CSS variables (`--gold/--teal/--bg/--panel/--text/...`) + `data-theme` + `dark-theme` class on `<html>`. **Do not touch theme application.**

**Critical rules (pixel parity):**
1. **Use the ORIGINAL class names from the EJS templates**, NOT invented ones. For every page, open the matching EJS view in `D:\VandeAgencyCRM\src\views\` and copy the exact class names. These are already styled by `app.css`.
2. Do NOT define your own `.page-header`, `.stats-bar`, `.form-card`, etc. — those are thin React helpers only and won't match the original look. Prefer the original classes.
3. Use theme variables in any new CSS: `var(--gold)`, `var(--teal)`, `var(--bg)`, `var(--panel)`, `var(--text)`, `var(--sub)`, `var(--muted)`, `var(--border)`, `var(--hover)`, `var(--gold-dim)`, `var(--accent-text)`. Never hard-code brand colors.
4. The `.btn` class is styled by the design system. Use `.btn` alone for the primary action (theme-gold). Do not add inline blue/gray colors.

**Key original class names (use these):**
- Page head: `page-head`, `dashboard-head`, `page-subtitle`, `page-head-actions` (NOT `.page-header`)
- Buttons: `btn`, `btn btn-*` variants (check EJS)
- Table: `leads-table-top-bar`, `data-table` (design system owns `.data-table`)
- Tabs: `lead-view-tabs`, `tab-nav-btn`, `tabs-nav-bar`
- Layout: `.sidebar`, `.topbar`, `.page-content`, `.nav-item`, `.nav-item.active`
- Badges: `stage-badge` (design system owns it)
- Modal/dialog: `simple-dialog`, `modal-header`, `modal-close`

When in doubt, open the original EJS view and mirror its exact class names — that IS the design system.

## Rules

1. Every API call goes through `api/client.ts` — never raw fetch
2. Every page handles loading, error, and empty states
3. Forms use controlled inputs (useState)
4. URL params drive filters (useSearchParams)
5. No inline styles — use CSS classes
6. No `any` type except in API response types (use proper interfaces)
7. One component per file
8. Export default the page component
