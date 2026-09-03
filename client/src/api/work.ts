import { api } from './client';
import { Customer } from '../types';

export interface WorkTypeField {
  key: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
  defaultValue?: any;
}

export interface WorkTypeStatus {
  key: string;
  label: string;
  color?: string;
}

export interface WorkType {
  _id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  statuses: WorkTypeStatus[];
  fields: WorkTypeField[];
  order?: number;
  isActive?: boolean;
}

export interface WorkSubtask {
  _id?: string;
  title: string;
  assignedTo?: { _id: string; name: string } | null;
  deadline?: string | null;
  status: string;
  priority?: string;
  createdAt?: string;
}

export interface WorkItem {
  _id: string;
  title: string;
  module: string;
  workType?: WorkType;
  workspace?: string;
  status: string;
  priority: 'low' | 'medium' | 'high';
  deadline?: string | null;
  startDate?: string | null;
  deliveredAt?: string | null;
  notes?: string;
  customer?: Customer | { _id: string; name: string; email?: string } | null;
  assignedTo?: { _id: string; name: string; email?: string } | null;
  collaborators?: { _id: string; name: string }[];
  secondaryAssignee?: { _id: string; name: string } | null;
  customFields?: Record<string, any>;
  subtasks?: WorkSubtask[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkCenterResponse {
  ok: true;
  workTypes: WorkType[];
  items: WorkItem[];
  counts: {
    open: number;
    completed: number;
    overdue: number;
    total: number;
  };
}

export interface WorkListResponse {
  ok: true;
  workType: WorkType;
  data: WorkItem[];
  users: { _id: string; name: string; email?: string }[];
  customers: { _id: string; name: string; company?: string }[];
  relatedItems: { _id: string; title: string; workType?: { name: string } }[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalResults: number;
  };
}

export interface WorkDetailResponse {
  ok: true;
  workType: WorkType;
  data: WorkItem;
  subtasks: WorkSubtask[];
  auditLog: any[];
  users: any[];
  customers: any[];
}

export const workApi = {
  getCenter: () => api.get<WorkCenterResponse>('/work'),
  list: (type: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<WorkListResponse>(`/work/${type}${query ? `?${query}` : ''}`);
  },
  get: (type: string, id: string) => api.get<WorkDetailResponse>(`/work/${type}/${id}`),
  create: (type: string, data: any) => api.post<{ ok: true; data: WorkItem }>(`/work/${type}`, data),
  update: (type: string, id: string, data: any) => api.put<{ ok: true; data: WorkItem }>(`/work/${type}/${id}`, data),
  updateStatus: (type: string, id: string, status: string) =>
    api.post<{ ok: true }>(`/work/${type}/${id}/status`, { status }),
  delete: (type: string, id: string) => api.delete<{ ok: true }>(`/work/${type}/${id}`),
  createSubtask: (type: string, id: string, data: Partial<WorkSubtask>) =>
    api.post<{ ok: true; data: WorkSubtask }>(`/work/${type}/${id}/subtasks`, data),
};
