import { api } from './client';
import { Customer, Stage } from '../types';
import { Company } from './companies';

export interface CampaignMetrics {
  totalLeads: number;
  qualifiedLeads: number;
  wonLeads: number;
  conversionRate: number;
  pipelineValue: number;
  wonRevenue: number;
  costPerLead: number;
  costPerQualifiedLead: number;
  costPerAcquisition: number;
  roi: number;
}

export interface Campaign {
  _id: string;
  name: string;
  platform: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  budget: number;
  spent: number;
  leadsCount: number;
  clicksCount: number;
  conversionsCount: number;
  metaCampaignId?: string;
  googleCampaignId?: string;
  clientCompany: Company | { _id: string; name: string };
  assignedManager?: { _id: string; name: string } | null;
  objective?: string;
  startDate?: string | null;
  endDate?: string | null;
  qualifiedLeadsCount?: number;
  salesCount?: number;
  revenue?: number;
  landingPageLink?: string;
  creativeLink?: string;
  notes?: string;
  actualLeadsCount?: number;
  pipelineValue?: number;
  metrics?: CampaignMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInput {
  name: string;
  clientCompany: string;
  platform: string;
  status: string;
  budget: number;
  spent: number;
  leadsCount?: number;
  clicksCount?: number;
  conversionsCount?: number;
  metaCampaignId?: string;
  googleCampaignId?: string;
  startDate?: string | null;
  endDate?: string | null;
  assignedManager?: string | null;
  objective?: string;
  qualifiedLeadsCount?: number;
  salesCount?: number;
  revenue?: number;
  landingPageLink?: string;
  creativeLink?: string;
  notes?: string;
}

export interface CampaignsResponse {
  ok: true;
  data: Campaign[];
  companies: Company[];
  stages: Stage[];
  users: any[];
  platformOptions: string[];
  statusOptions: string[];
}

export interface CampaignDetailResponse {
  ok: true;
  data: Campaign;
  customers: Customer[];
  companies: Company[];
  stages: Stage[];
  users: any[];
  platformOptions: string[];
  statusOptions: string[];
}

export const campaignsApi = {
  list: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<CampaignsResponse>(`/campaigns${query ? `?${query}` : ''}`);
  },
  get: (id: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<CampaignDetailResponse>(`/campaigns/${id}${query ? `?${query}` : ''}`);
  },
  create: (data: CampaignInput) => api.post<{ ok: true; data: Campaign }>('/campaigns', data),
  update: (id: string, data: Partial<CampaignInput>) => api.put<{ ok: true; data: Campaign }>(`/campaigns/${id}`, data),
  updateStatus: (id: string, status: string) => api.post<{ ok: true }>(`/campaigns/${id}/status`, { status }),
  delete: (id: string) => api.delete<{ ok: true }>(`/campaigns/${id}`),
};
