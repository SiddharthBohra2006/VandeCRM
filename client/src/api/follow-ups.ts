import { api } from './client';
import { Customer } from '../types';

export interface FollowUpStats {
  due: number;
  today: number;
  upcoming: number;
  all: number;
}

export interface FollowUpActivity {
  _id: string;
  customer?: Customer;
  user?: { _id: string; name: string };
  type: string;
  note: string;
  comment?: string;
  nextFollowUpAt?: string;
  followUpAction?: string;
  createdAt: string;
}

export interface FollowUpsResponse {
  ok: true;
  followUps: Customer[];
  completedFollowUps: FollowUpActivity[];
  stats: FollowUpStats;
  view: string;
}

export const followUpsApi = {
  list: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<FollowUpsResponse>(`/follow-ups${query ? `?${query}` : ''}`);
  },
  complete: (id: string, comment?: string) =>
    api.post<{ ok: true }>(`/follow-ups/${id}/complete`, { comment }),
  reschedule: (id: string, nextFollowUpAt: string, comment?: string) =>
    api.post<{ ok: true; nextFollowUpAt: string }>(`/follow-ups/${id}/reschedule`, { nextFollowUpAt, comment }),
};