import { api } from './client';
import { Customer, CustomerInput, PaginatedResponse, Stage, Label, CustomField, LeadStats } from '../types';

export interface CustomersListResponse extends PaginatedResponse<Customer> {
  stages: Stage[];
  labels: Label[];
  fields: CustomField[];
  companies: { _id: string; name: string }[];
  campaigns: { _id: string; name: string }[];
  users: { _id: string; name: string }[];
  savedViews: any[];
  leadStats: LeadStats;
}

export interface Activity {
  _id: string;
  type: string;
  note: string;
  user?: { _id: string; name: string };
  createdAt: string;
}

export interface Attachment {
  _id: string;
  originalName: string;
  category: string;
  size: number;
  createdAt: string;
}

export interface RelatedWork {
  _id: string;
  title: string;
  status: string;
  module?: { key: string; name: string };
}

export interface CustomerDetailResponse {
  ok: true;
  data: Customer;
  activities: Activity[];
  attachments: Attachment[];
  relatedWork: RelatedWork[];
  stages: Stage[];
  labels: Label[];
  users: { _id: string; name: string }[];
  campaigns: { _id: string; name: string }[];
  fields: CustomField[];
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: 'create' | 'update' | 'skip';
  name: string;
  email: string;
  phone: string;
  messages: string[];
}

export interface ImportPreviewResult {
  ok: true;
  preview: {
    headers: string[];
    totalRows: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    rows: ImportPreviewRow[];
  };
}

export interface ImportResult {
  ok: true;
  imported: number;
  updated: number;
  skipped: number;
}

export const customersApi = {
  list: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return api.get<CustomersListResponse>(`/customers?${query}`);
  },

  get: (id: string) =>
    api.get<CustomerDetailResponse>(`/customers/${id}`),

  create: (data: CustomerInput) =>
    api.post<{ ok: true; data: Customer }>('/customers', data),

  update: (id: string, data: Partial<CustomerInput>) =>
    api.put<{ ok: true; data: Customer }>(`/customers/${id}`, data),

  delete: (id: string) =>
    api.delete<{ ok: true }>(`/customers/${id}`),

  bulk: (data: { action: string; selectedIds: string[]; [key: string]: unknown }) =>
    api.post<{ ok: true; message: string }>('/customers/bulk', data),

  importPreview: async (data: { csvData: string; csvFileName?: string; duplicateRule?: string }): Promise<ImportPreviewResult> => {
    const token = localStorage.getItem('crm_token');
    const res = await fetch('/api/customers/import/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data.csvData,
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || 'Import preview failed');
    return result;
  },

  import: async (data: { csvData: string; csvFileName?: string; duplicateRule?: string; defaultStageId?: string; defaultAssignedToId?: string }): Promise<ImportResult> => {
    const token = localStorage.getItem('crm_token');
    const res = await fetch('/api/customers/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data.csvData,
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || 'Import failed');
    return result;
  },

  getDuplicates: () => api.get<{ ok: true; duplicateGroups: any[] }>('/customers/duplicates'),
  mergeDuplicate: (primaryId: string, duplicateId: string) =>
    api.post<{ ok: true }>('/customers/duplicates/merge', { primaryId, duplicateId }),

  addActivity: (id: string, data: { type: string; note: string; nextFollowUpAt?: string }) =>
    api.post<{ ok: true; data: Activity }>(`/customers/${id}/activity`, data),

  updateStage: (id: string, stageId: string) =>
    api.post<{ ok: true; stage: Stage }>(`/customers/${id}/stage`, { stageId }),

  transferLead: (id: string, assignedTo: string | null) =>
    api.post<{ ok: true; assignedTo: any }>(`/customers/${id}/transfer`, { assignedTo }),

  uploadAttachment: (id: string, data: { fileData: string; originalName: string; category?: string; notes?: string }) =>
    api.post<{ ok: true; attachment: Attachment }>(`/customers/${id}/attachments`, data),

  deleteAttachment: (id: string, attachmentId: string) =>
    api.delete<{ ok: true }>(`/customers/${id}/attachments/${attachmentId}`),
};

export async function downloadCustomersCsv(params: { scope?: string; dateFrom?: string; dateTo?: string }) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
  ).toString();
  const token = localStorage.getItem('crm_token');
  const res = await fetch(`/api/customers/export/csv?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = 'Export failed';
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const contentDisposition = res.headers.get('Content-Disposition') || '';
  const fileMatch = contentDisposition.match(/filename="?([^";]+)"?/);
  a.href = url;
  a.download = fileMatch ? fileMatch[1] : `${params.scope === 'clients' ? 'clients' : 'leads'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
