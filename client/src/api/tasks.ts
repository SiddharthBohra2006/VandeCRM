import { api } from './client';
import { Customer } from '../types';

export interface TaskStats {
  due: number;
  today: number;
  upcoming: number;
  all: number;
}

export interface TaskActivity {
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

export interface TasksResponse {
  ok: true;
  tasks: Customer[];
  completedTasks: TaskActivity[];
  stats: TaskStats;
  view: string;
}

export const tasksApi = {
  list: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get<TasksResponse>(`/tasks${query ? `?${query}` : ''}`);
  },
  complete: (id: string, comment?: string) =>
    api.post<{ ok: true }>(`/tasks/${id}/complete`, { comment }),
  reschedule: (id: string, nextFollowUpAt: string, comment?: string) =>
    api.post<{ ok: true; nextFollowUpAt: string }>(`/tasks/${id}/reschedule`, { nextFollowUpAt, comment }),
};
