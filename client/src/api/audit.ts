import { api } from './client';

export interface AuditLogEntry {
  _id: string;
  organization: string;
  user?: {
    _id: string;
    name: string;
    email: string;
    role: string;
  };
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  message: string;
  metadata?: any;
  ipAddress?: string;
  createdAt: string;
}

export interface AuditResponse {
  ok: true;
  logs: AuditLogEntry[];
  users: Array<{ _id: string; name: string; email: string; role: string }>;
  actions: string[];
  entityTypes: string[];
  filters: {
    action?: string;
    entityType?: string;
    user?: string;
  };
}

export const auditApi = {
  get: (params?: { action?: string; entityType?: string; user?: string }) => {
    const sp = new URLSearchParams();
    if (params?.action) sp.set('action', params.action);
    if (params?.entityType) sp.set('entityType', params.entityType);
    if (params?.user) sp.set('user', params.user);
    const query = sp.toString() ? `?${sp.toString()}` : '';
    return api.get<AuditResponse>(`/audit${query}`);
  },
};
