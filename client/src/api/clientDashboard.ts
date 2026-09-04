import { api } from './client';

export interface ClientDashboardMetrics {
  totalLeads: number;
  activeCount: number;
  wonCount: number;
  lostCount: number;
  pipelineValue: number;
  wonValue: number;
  winRate: string;
  campaignCount: number;
  activeCampaignCount: number;
  budget: number;
  spend: number;
  costPerLead: number;
  roi: number;
  overdueFollowups: number;
  accountStatus?: string;
}

export interface ClientPortalCompany {
  _id: string;
  name: string;
  website?: string;
  metaPixelId?: string;
  ga4MeasurementId?: string;
}

export interface ClientCampaignReport {
  _id: string;
  name: string;
  platform: string;
  status: string;
  spent: number;
  reportMetrics: {
    totalLeads: number;
    costPerLead: number;
  };
}

export interface ClientWorkItem {
  title: string;
  status: string;
  deadline?: string;
  completed: number;
  total: number;
  progress: number | null;
}

export interface ClientPortalCustomer {
  _id: string;
  name: string;
  source?: string;
  value?: number;
  createdAt?: string;
  campaign?: { _id: string; name: string } | null;
  stage?: { _id: string; name: string; color: string } | null;
}

export interface ClientDashboardResponse {
  ok: true;
  company: ClientPortalCompany | null;
  companies: { _id: string; name: string }[];
  campaigns: ClientCampaignReport[];
  customers: ClientPortalCustomer[];
  clientWork: ClientWorkItem[];
  metrics: ClientDashboardMetrics | null;
  filters: { company: string; dateFrom?: string; dateTo?: string };
}

function buildQuery(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (!entries.length) return '';
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, v!])).toString();
  return qs ? `?${qs}` : '';
}

async function downloadFile(url: string, fallbackName: string) {
  const token = localStorage.getItem('crm_token');
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let msg = 'Export failed';
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const contentDisposition = res.headers.get('Content-Disposition') || '';
  const fileMatch = contentDisposition.match(/filename="?([^";]+)"?/);
  a.href = blobUrl;
  a.download = fileMatch ? fileMatch[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export const clientDashboardApi = {
  get: (params: { company?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<ClientDashboardResponse>(`/client-dashboard${buildQuery(params)}`),

  exportCsv: (params: { company: string; dateFrom?: string; dateTo?: string }) =>
    downloadFile(`/api/client-dashboard/export.csv${buildQuery(params)}`, 'client-report.csv'),

  exportPdf: (params: { company: string; dateFrom?: string; dateTo?: string; month?: string }) =>
    downloadFile(`/api/client-dashboard/export.pdf${buildQuery(params)}`, 'client-report-package.pdf'),
};