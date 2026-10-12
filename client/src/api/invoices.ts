import { api, downloadAuthenticatedFile } from './client';

export interface InvoicePayment { _id: string; amount: number; method: string; reference?: string; note?: string; paidAt: string; }
export interface Invoice { _id: string; invoiceNumber: string; description: string; amount: number; discount: number; dueDate: string | null; createdAt: string; total: number; paid: number; balance: number; status: 'paid' | 'partial' | 'unpaid' | 'overdue'; payments: InvoicePayment[]; }

export const invoicesApi = {
  list: (customerId: string) => api.get<{ ok: true; data: Invoice[] }>(`/invoices/customers/${customerId}`, { skipCache: true }),
  create: (customerId: string, body: { description: string; amount: number; discount?: number; dueDate?: string }) => api.post<{ ok: true; data: Invoice }>(`/invoices/customers/${customerId}`, body),
  addPayment: (invoiceId: string, body: { amount: number; method: string; reference?: string; note?: string }) => api.post<{ ok: true; data: Invoice }>(`/invoices/${invoiceId}/payments`, body),
  download: (invoice: Invoice) => downloadAuthenticatedFile(`/invoices/${invoice._id}/pdf`, `${invoice.invoiceNumber}.pdf`),
};
