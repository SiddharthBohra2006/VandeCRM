import { api } from './client';
import { Customer, Stage, Label } from '../types';

export interface AssignedUser {
  _id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface Company {
  _id: string;
  name: string;
  website?: string;
  category?: string;
  businessType?: 'service' | 'consumer' | 'commerce' | 'other';
  contactPerson?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  location?: string;
  status: 'onboarding' | 'active' | 'inactive';
  isMain?: boolean;
  healthStatus?: 'healthy' | 'watch' | 'at-risk';
  leadCount?: number;
  campaignCount?: number;
  monthlyPackage?: number;
  monthlyVideoTarget?: number;
  monthlyDesignTarget?: number;
  monthlyContentTarget?: number;
  monthlyLeadTarget?: number;
  sopDocumentLink?: string;
  googleDriveFolderLink?: string;
  notes?: string;
  metaPixelId?: string;
  ga4MeasurementId?: string;
  apiKey?: string;
  assignedUsers?: AssignedUser[];
  accountOwner?: AssignedUser | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMetrics {
  totalLeads: number;
  pipelineValue: number;
  wonRevenue: number;
  activeCampaigns: number;
  conversionRate: number;
}

export interface CompanyDetailResponse {
  ok: true;
  data: Company;
  customers: Customer[];
  stages: Stage[];
  labels: Label[];
  campaigns: any[];
  activities: any[];
  attachments: any[];
  metrics: CompanyMetrics;
  users: AssignedUser[];
}

export interface CompanyInput {
  name: string;
  website?: string;
  businessType?: string;
  category?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  location?: string;
  status?: string;
  healthStatus?: string;
  monthlyPackage?: number;
  startDate?: string | null;
  monthlyVideoTarget?: number;
  monthlyDesignTarget?: number;
  monthlyContentTarget?: number;
  monthlyLeadTarget?: number;
  sopDocumentLink?: string;
  googleDriveFolderLink?: string;
  notes?: string;
  metaPixelId?: string;
  ga4MeasurementId?: string;
  accountOwner?: string | null;
  assignedUsers?: string[];
  moduleSetup?: string;
}

export const companiesApi = {
  list: () => api.get<{ ok: true; data: Company[]; users: AssignedUser[] }>('/companies'),
  get: (id: string) => api.get<CompanyDetailResponse>(`/companies/${id}`),
  create: (data: CompanyInput) => api.post<{ ok: true; data: Company }>('/companies', data),
  update: (id: string, data: Partial<CompanyInput>) => api.put<{ ok: true; data: Company }>(`/companies/${id}`, data),
  switch: (companyId: string) => api.post<{ ok: true; token: string; activeCompany: any }>('/companies/switch', { companyId }),
  setMain: (id: string) => api.post<{ ok: true }>(`/companies/${id}/main`, {}),
  updateCollaborators: (id: string, userIds: string[]) =>
    api.post<{ ok: true }>(`/companies/${id}/collaborators`, { userIds }),
  regenerateApiKey: (id: string) => api.post<{ ok: true; apiKey: string }>(`/companies/${id}/api-key/regenerate`, {}),
};
