import { api, downloadAuthenticatedFile } from './client';

export interface InvoicePayment { _id: string; amount: number; method: string; reference?: string; note?: string; paidAt: string; }
export interface InvoiceInstallment { _id?: string; name: string; amount: number; dueDate: string; }
export interface Invoice { _id: string; invoiceNumber: string; description: string; amount: number; discount: number; discountType: 'amount' | 'percent'; dueDate: string | null; installments: InvoiceInstallment[]; monthlyRenewal: boolean; nextRenewalDate: string | null; renewalPromptedMonth: string; renewalSource?: string | null; renewalPeriod?: string; createdAt: string; total: number; paid: number; balance: number; status: 'paid' | 'partial' | 'unpaid' | 'overdue'; payments: InvoicePayment[]; }

export const invoicesApi = {
  list: (customerId: string) => api.get<{ ok: true; data: Invoice[] }>(`/invoices/customers/${customerId}`, { skipCache: true }),
  create: (customerId: string, body: { description: string; amount: number; discount?: number; discountType?: 'amount' | 'percent'; dueDate?: string; installments?: InvoiceInstallment[]; monthlyRenewal?: boolean }) => api.post<{ ok: true; data: Invoice }>(`/invoices/customers/${customerId}`, body),
  addPayment: (invoiceId: string, body: { amount: number; method: string; reference?: string; note?: string }) => api.post<{ ok: true; data: Invoice }>(`/invoices/${invoiceId}/payments`, body),
  renewal: (invoiceId: string, action: 'continue' | 'stop') => api.post<{ ok: true; continued: boolean; data?: Invoice }>(`/invoices/${invoiceId}/renewal`, { action }),
  remove: (invoiceId: string) => api.delete<{ ok: true }>(`/invoices/${invoiceId}`),
  download: (invoice: Invoice) => downloadAuthenticatedFile(`/invoices/${invoice._id}/pdf`, `${invoice.invoiceNumber}.pdf`),
};
