import { api } from './client';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  kind: string;
  date?: string;
  badge?: string | null;
}

export interface SearchGroup {
  id: string;
  label: string;
  items: SearchResultItem[];
  hasMore: boolean;
}

export interface SearchStats {
  myFollowUps: number;
  openTasks: number;
  todayMeetings: number;
  unreadMessages: number;
}

export interface SearchOptions {
  q: string;
  type: string;
  dateField: string;
  preset?: string;
  from?: string;
  to?: string;
  module?: string;
  page: number;
}

export interface SearchResponse {
  ok: true;
  search: SearchOptions;
  groups: SearchGroup[];
  stats: SearchStats;
  warnings: string[];
  modules: Array<{ id: string; name: string }>;
}

export const searchApi = {
  query: (params?: {
    q?: string;
    type?: string;
    dateField?: string;
    preset?: string;
    from?: string;
    to?: string;
    module?: string;
    page?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.type) sp.set('type', params.type);
    if (params?.dateField) sp.set('dateField', params.dateField);
    if (params?.preset) sp.set('preset', params.preset);
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    if (params?.module) sp.set('module', params.module);
    if (params?.page) sp.set('page', String(params.page));

    const query = sp.toString() ? `?${sp.toString()}` : '';
    return api.get<SearchResponse>(`/search${query}`);
  },
};
