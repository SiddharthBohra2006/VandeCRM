import { api } from './client';
import { WorkType } from './auth';

export interface SavedReportItem {
  _id: string;
  name: string;
  config: Record<string, any>;
}

export interface ReportsIndexResponse {
  ok: true;
  reportWorkTypes: WorkType[];
  savedReports: SavedReportItem[];
}

export interface ReportFilters {
  companies: { _id: string; name: string }[];
  campaigns: { _id: string; name: string }[];
  agents: { _id: string; name: string }[];
  workTypes?: WorkType[];
}

export interface Report {
  title: string;
  columns: string[];
  rows: Record<string, any>[];
  filters: ReportFilters;
  staleDays?: number;
  selectedWorkType?: WorkType;
}

export interface ReportResponse {
  ok: true;
  reportKey: string;
  report: Report;
  query: Record<string, string>;
}

export interface ExportResponse {
  ok: true;
  filename: string;
  csv?: string;
  base64?: string;
}

export interface ModuleReport {
  columns: string[];
  rows: Record<string, any>[];
  totalRecords: number;
}

export interface ModuleReportBuilderResponse {
  ok: true;
  workTypes: WorkType[];
  workType: WorkType | null;
  saved: SavedReportItem | null;
  query: Record<string, any>;
  users: { _id: string; name: string }[];
  savedReports: SavedReportItem[];
  config: Record<string, any>;
  options: { groups: { key: string; label: string }[]; numeric: { key: string; label: string }[] };
  report: ModuleReport;
}

export function downloadBlob(content: string | BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const reportsApi = {
  index: () => api.get<ReportsIndexResponse>('/reports'),

  report: (reportKey: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<ReportResponse>(`/reports/${reportKey}${query ? `?${query}` : ''}`);
  },

  exportCsv: async (reportKey: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await api.get<ExportResponse>(`/reports/${reportKey}/export.csv${query ? `?${query}` : ''}`);
    if (res.csv) downloadBlob(res.csv, res.filename, 'text/csv;charset=utf-8;');
  },

  exportPdf: async (reportKey: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await api.get<ExportResponse>(`/reports/${reportKey}/export.pdf${query ? `?${query}` : ''}`);
    if (res.base64) {
      const bytes = atob(res.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      downloadBlob(arr, res.filename, 'application/pdf');
    }
  },

  moduleBuilder: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<ModuleReportBuilderResponse>(`/reports/module-builder${query ? `?${query}` : ''}`);
  },

  exportModuleCsv: async (query: string = '') => {
    const res = await api.get<ExportResponse>(`/reports/module-builder/export.csv${query ? `?${query}` : ''}`);
    if (res.csv) downloadBlob(res.csv, res.filename, 'text/csv;charset=utf-8;');
  },

  exportModuleRawCsv: async (query: string = '') => {
    const res = await api.get<ExportResponse>(`/reports/module-builder/export-raw.csv${query ? `?${query}` : ''}`);
    if (res.csv) downloadBlob(res.csv, res.filename, 'text/csv;charset=utf-8;');
  },

  saveModuleReport: (name: string, config: Record<string, any>) =>
    api.post<{ ok: true; savedReport: SavedReportItem }>('/reports/module-builder/save', { name, ...config }),

  deleteModuleReport: (id: string) =>
    api.delete<{ ok: true }>(`/reports/module-builder/${id}`),
};
