import { api } from './client';

export interface PortfolioCompany {
  _id: string;
  name: string;
  isMain: boolean;
  businessType: string;
  category: string;
  status: string;
}

export interface PerCrm {
  company: PortfolioCompany;
  leads: number;
  value: number;
  openWork: number;
  moduleCounts: { name: string; count: number }[];
  adSpend: number;
}

export interface PortfolioTotals {
  crms: number;
  leads: number;
  value: number;
  openWork: number;
}

export interface WorkLibraryItem {
  _id: string;
  name: string;
  company: string;
  count: number;
}

export interface PortfolioResponse {
  ok: true;
  companies: PortfolioCompany[];
  perCrm: PerCrm[];
  detail: string;
  detailLeads: any[];
  visibleWork: any[];
  workLibrary: WorkLibraryItem[];
  mainCompanyName: string;
  totals: PortfolioTotals;
}

export const portfolioApi = {
  list: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<PortfolioResponse>(`/portfolio${query ? `?${query}` : ''}`);
  },
};
