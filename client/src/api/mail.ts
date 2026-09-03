import { api } from './client';
import { Customer } from '../types';

export interface EmailAccount {
  _id: string;
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  lastVerifiedAt?: string | null;
  isActive: boolean;
}

export interface EmailTemplate {
  _id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  createdAt?: string;
}

export interface EmailMessage {
  _id: string;
  customer?: Customer;
  sentBy?: { _id: string; name: string };
  template?: EmailTemplate;
  toEmail: string;
  fromEmail: string;
  subject: string;
  body: string;
  sentAt: string;
}

export interface MailResponse {
  ok: true;
  account: EmailAccount | null;
  templates: EmailTemplate[];
  customers: Customer[];
  messages: EmailMessage[];
  templateCategories: string[];
}

export const mailApi = {
  get: () => api.get<MailResponse>('/mail'),
  send: (data: { customerId: string; templateId?: string; subject: string; body: string }) =>
    api.post<{ ok: true; data: EmailMessage }>('/mail/send', data),
  createTemplate: (data: Partial<EmailTemplate>) =>
    api.post<{ ok: true; data: EmailTemplate }>('/mail/templates', data),
  updateTemplate: (id: string, data: Partial<EmailTemplate>) =>
    api.put<{ ok: true; data: EmailTemplate }>(`/mail/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete<{ ok: true }>(`/mail/templates/${id}`),
  saveSettings: (data: any) => api.post<{ ok: true; data: EmailAccount }>('/mail/settings', data),
};
