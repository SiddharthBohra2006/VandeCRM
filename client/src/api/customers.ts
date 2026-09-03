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
};
