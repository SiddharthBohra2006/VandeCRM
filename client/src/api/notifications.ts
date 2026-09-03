import { api } from './client';

export interface NotificationItem {
  _id: string;
  organization: string;
  user: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationFeedResponse {
  ok: true;
  count: number;
  data: NotificationItem[];
}

export const notificationsApi = {
  getFeed: () => api.get<NotificationFeedResponse>('/notifications/feed'),
  list: (unreadOnly = false) =>
    api.get<{ ok: true; data: NotificationItem[]; count: number }>(
      `/notifications${unreadOnly ? '?unread=true' : ''}`
    ),
  markAsRead: (id: string) => api.post<{ ok: true }>(`/notifications/${id}/read`, {}),
  markAllAsRead: () => api.post<{ ok: true }>('/notifications/read-all', {}),
};
