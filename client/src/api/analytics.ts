import { api } from './client';

export interface AnalyticsStats {
  totalLeads: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
  winRate: string;
  totalValue: number;
  wonValue: number;
}

export interface AnalyticsStageSummary {
  name: string;
  color: string;
  count: number;
  value: number;
}

export interface AnalyticsCampaignSummary {
  name: string;
  platform: string;
  status: string;
  budget: number;
  leadsCount: number;
  pipelineValue: number;
  wonValue: number;
}

export interface AnalyticsCompanySummary {
  name: string;
  status: string;
  leadsCount: number;
  pipelineValue: number;
}

export interface IngestionTrendPoint {
  dateStr: string;
  count: number;
}

export interface AnalyticsTrends {
  totalLeads: number[];
  activeLeads: number[];
  wonDeals: number[];
}

export interface AnalyticsFilters {
  clientCompany: string;
  campaign: string;
  dateFrom: string;
  dateTo: string;
}

export interface AnalyticsResponse {
  ok: true;
  stageSummary: AnalyticsStageSummary[];
  campaignSummary: AnalyticsCampaignSummary[];
  companySummary: AnalyticsCompanySummary[];
  companies: { _id: string; name: string }[];
  campaigns: { _id: string; name: string; platform: string }[];
  ingestionTrend: IngestionTrendPoint[];
  trends: AnalyticsTrends;
  filters: AnalyticsFilters;
  stats: AnalyticsStats;
}

export const analyticsApi = {
  list: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<AnalyticsResponse>(`/analytics${query ? `?${query}` : ''}`);
  },
};
