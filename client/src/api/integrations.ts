import { api } from './client';

export interface SyncLog {
  _id: string;
  clientCompany?: { _id: string; name: string };
  provider: 'meta' | 'ga4' | 'webhook' | 'all';
  trigger: 'manual' | 'scheduled' | 'retry';
  status: 'success' | 'failed' | 'running' | 'skipped';
  syncedCount?: number;
  failedCount?: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface IntegrationChecklistItem {
  label: string;
  done: boolean;
}

export interface CompanyIntegrationSetup {
  company: {
    _id: string;
    name: string;
    metaAdAccountId?: string;
    ga4PropertyId?: string;
    hasMetaToken?: boolean;
    hasGa4Json?: boolean;
    apiKey?: string;
    apiKeyStatus?: string;
    integrationSyncEnabled?: boolean;
    integrationSyncIntervalMinutes?: number;
    lastIntegrationSyncAt?: string;
  };
  latestLog: SyncLog | null;
  items: IntegrationChecklistItem[];
}

export interface IntegrationsResponse {
  ok: true;
  campaigns: any[];
  companies: any[];
  logs: SyncLog[];
  failedLogs: SyncLog[];
  dueCompanies: any[];
  setupChecklist: CompanyIntegrationSetup[];
  hasMetaConnected: boolean;
  hasGaConnected: boolean;
}

export const integrationsApi = {
  get: () => api.get<IntegrationsResponse>('/integrations'),
  saveCredentials: (companyId: string, data: { metaAdAccountId?: string; metaAccessToken?: string; ga4PropertyId?: string; ga4ServiceAccountJson?: string }) =>
    api.post<{ ok: true; data: any }>(`/integrations/companies/${companyId}/credentials`, data),
  clearMeta: (companyId: string) => api.post<{ ok: true; data: any }>(`/integrations/companies/${companyId}/meta/clear`),
  clearGa4: (companyId: string) => api.post<{ ok: true; data: any }>(`/integrations/companies/${companyId}/ga4/clear`),
  setApiKeyStatus: (companyId: string, apiKeyStatus: 'active' | 'disabled') => api.post<{ ok: true; data: any }>(`/integrations/companies/${companyId}/api-key/status`, { apiKeyStatus }),
  rotateApiKey: (companyId: string) => api.post<{ ok: true; data: any }>(`/integrations/companies/${companyId}/api-key/rotate`),
  runDue: () => api.post<{ ok: true; count: number }>('/integrations/scheduled/run-due'),
  saveSyncSettings: (companyId: string, data: { integrationSyncEnabled: boolean; integrationSyncIntervalMinutes: number }) =>
    api.post<{ ok: true; data: any }>(`/integrations/companies/${companyId}/sync-settings`, data),
  syncCompany: (companyId: string) =>
    api.post<{ ok: true; data: any }>(`/integrations/companies/${companyId}/sync`),
  syncAll: () =>
    api.post<{ ok: true; summary: any }>('/integrations/sync'),
  retryLog: (logId: string) =>
    api.post<{ ok: true; data: any }>(`/integrations/logs/${logId}/retry`),
};
