import { api } from './client';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  organization: { _id: string; name: string };
  dashboardHiddenSections: string[];
  dashboardHiddenCards: string[];
  dashboardCardOrder: string[];
  sidebarHiddenItems: string[];
}

export interface Company {
  _id: string;
  name: string;
  isMain: boolean;
}

export interface WorkType {
  _id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  statuses: { key: string; label: string; color: string }[];
  fields: any[];
  presentation: any;
}

export interface CrmTerms {
  leadSingular: string;
  leadPlural: string;
  recordSingular: string;
  recordPlural: string;
  pipelineName: string;
}

export interface AuthMeResponse {
  ok: true;
  user: User;
  companies: Company[];
  activeCompany: Company | null;
  crmTerms: CrmTerms;
  workTypes: WorkType[];
}

export interface LoginResponse {
  ok: true;
  token: string;
  user: User;
  activeCompany: Company | null;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),

  signup: (data: { name: string; email: string; password: string; orgName: string }) =>
    api.post<LoginResponse>('/auth/signup', data),

  me: () => api.get<AuthMeResponse>('/auth/me'),

  switchCompany: (companyId: string) =>
    api.post<{ ok: true; token: string; activeCompany: Company }>('/auth/switch-company', { companyId }),
};
