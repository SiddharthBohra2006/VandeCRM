import { api } from './client';
import { Company } from './companies';

export interface LeadFieldPermissions {
  configured: boolean;
  visible: string[];
  editable: string[];
}

export interface WorkTypePermission {
  workTypeId: string;
  actions: string[];
  editableFieldKeys: string[];
}

export interface CustomRole {
  _id: string;
  name: string;
  permissions: string[];
  scope: 'organization' | 'assigned';
  description?: string;
  leadFieldPermissions?: LeadFieldPermissions;
  fieldPermissions?: Record<string, string[]>;
  workTypePermissions?: WorkTypePermission[];
}

export interface WorkTypeLite {
  _id: string;
  name: string;
  key: string;
  fields?: Array<{ key: string; label?: string }>;
}

export interface LeadFieldLite {
  _id: string;
  key: string;
  label: string;
  type?: string;
}

export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  role: string;
  customRole?: CustomRole | null;
  isActive: boolean;
  hiddenModules?: string[];
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamSummary {
  total: number;
  active: number;
  inactive: number;
}

export interface TeamResponse {
  ok: true;
  users: TeamMember[];
  teamSummary: TeamSummary;
  companies: Company[];
  roleDefinitions: Record<string, { label: string; description?: string }>;
  customRoles: CustomRole[];
  permissionModules: string[];
  permissionActions: string[];
  workFieldGroups?: Record<string, { core: string[]; links: string[] }>;
  workTypes?: WorkTypeLite[];
  leadFields?: LeadFieldLite[];
}

export interface TeamMemberInput {
  name: string;
  email: string;
  password?: string;
  role: string;
  customRole?: string | null;
  assignedCompanies?: string[];
  hiddenModules?: string[];
  isActive?: boolean;
}

export const teamApi = {
  list: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<TeamResponse>(`/team${query ? `?${query}` : ''}`);
  },
  create: (data: TeamMemberInput) => api.post<{ ok: true; data: TeamMember }>('/team', data),
  update: (id: string, data: Partial<TeamMemberInput>) =>
    api.put<{ ok: true; data: TeamMember }>(`/team/${id}`, data),
  delete: (id: string) => api.delete<{ ok: true }>(`/team/${id}`),

  listRoles: () => api.get<{ ok: true; data: CustomRole[] }>('/team/roles'),
  createRole: (data: Partial<CustomRole>) =>
    api.post<{ ok: true; data: CustomRole }>('/team/roles', data),
  updateRole: (id: string, data: Partial<CustomRole>) =>
    api.put<{ ok: true; data: CustomRole }>(`/team/roles/${id}`, data),
  deleteRole: (id: string) => api.delete<{ ok: true }>(`/team/roles/${id}`),
};
