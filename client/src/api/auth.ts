import { api } from './client';

export interface OrganizationTheme {
  gold: string;
  teal: string;
  background: string;
  surface: string;
  text: string;
}

export interface OrganizationInfo {
  _id: string;
  name: string;
  theme?: OrganizationTheme;
  analyticsHeading?: string;
  currency?: string;
  locale?: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  customRole?: {
    _id: string;
    name: string;
    scope?: 'organization' | 'assigned';
    permissions?: string[];
    leadFieldPermissions?: { configured: boolean; visible: string[]; editable: string[] };
    workTypePermissions?: Array<{ workTypeId: string; actions: string[]; editableFieldKeys: string[] }>;
  } | null;
  organization: OrganizationInfo;
  hiddenModules?: string[];
  dashboardHiddenSections: string[];
  dashboardHiddenCards: string[];
  dashboardCardOrder: string[];
  sidebarHiddenItems: string[];
  lastLoginAt?: string | null;
  loginCount?: number;
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
  statuses: { key: string; label: string; color: string; isTerminalWon?: boolean; isTerminalLost?: boolean; requiresApproval?: boolean }[];
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

  forgotPassword: (email: string) =>
    api.post<{ ok: true; message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string, confirmPassword: string) =>
    api.post<{ ok: true; message: string }>('/auth/reset-password', { token, password, confirmPassword }),

  adminRecovery: (email: string, password: string, confirmPassword: string, recoveryKey: string) =>
    api.post<{ ok: true; message: string }>('/auth/admin-recovery', { email, password, confirmPassword, recoveryKey }),
};
