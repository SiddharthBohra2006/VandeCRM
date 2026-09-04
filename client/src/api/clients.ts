import { api } from './client';
import { Customer, PaginatedResponse, Stage, Label, CustomField } from '../types';

export interface ClientStats {
  totalClients: number;
  newClients: number;
  totalValue: number;
  highPriorityCount: number;
}

export interface ClientsListResponse extends PaginatedResponse<Customer> {
  stages: Stage[];
  labels: Label[];
  fields: CustomField[];
  companies: { _id: string; name: string }[];
  campaigns: { _id: string; name: string; platform?: string }[];
  users: { _id: string; name: string }[];
  savedViews: any[];
  activeSavedView: any;
  filters: Record<string, string>;
  clientStats: ClientStats;
}

export const clientsApi = {
  list: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return api.get<ClientsListResponse>(`/clients?${query}`);
  },
};
