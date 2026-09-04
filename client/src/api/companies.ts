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

export interface CompanyAttachment {
  _id: string;
  originalName: string;
  category: 'proposal' | 'contract' | 'invoice' | 'brief' | 'screenshot' | 'other';
  mimeType?: string;
  size: number;
  notes?: string;
  uploadedBy?: {
    _id: string;
    name: string;
    email?: string;
    role?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMetrics {
  totalLeads: number;
  pipelineValue: number;
  wonValue?: number;
  wonRevenue?: number;
  activeCampaigns: number;
  winRate?: number;
  conversionRate?: number;
  activeCount?: number;
  lostCount?: number;
  spend?: number;
  costPerLead?: number;
  roi?: number;
  overdueFollowups?: number;
}

export interface CompanyDetailResponse {
  ok: true;
  data: Company;
  customers: Customer[];
  stages: Stage[];
  labels: Label[];
  campaigns: any[];
  activities: any[];
  attachments: CompanyAttachment[];
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
  addCollaborator: (id: string, userId: string) =>
    api.post<{ ok: true }>(`/companies/${id}/collaborators/add`, { userId }),
  removeCollaborator: (id: string, userId: string) =>
    api.post<{ ok: true }>(`/companies/${id}/collaborators/remove`, { userId }),
  uploadAttachment: (id: string, data: { category: string; originalName: string; fileData: string; notes?: string }) =>
    api.post<{ ok: true; data: CompanyAttachment }>(`/companies/${id}/attachments`, data),
  deleteAttachment: (id: string, attachmentId: string) =>
    api.delete<{ ok: true }>(`/companies/${id}/attachments/${attachmentId}`),
  regenerateApiKey: (id: string) => api.post<{ ok: true; apiKey: string }>(`/companies/${id}/api-key/regenerate`, {}),
};
