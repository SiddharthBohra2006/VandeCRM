import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { invoicesApi } from '../../api/invoices';

export default function ClientPaymentStatus({ customerId }: { customerId: string }) {
  const [summary, setSummary] = useState<{ status: string; balance: number } | null>(null);

  useEffect(() => {
    let active = true;
    invoicesApi.list(customerId).then(({ data }) => {
      if (!active) return;
      const balance = data.reduce((sum, invoice) => sum + invoice.balance, 0);
      const hasOverdue = data.some(invoice => invoice.status === 'overdue');
      const hasPayments = data.some(invoice => invoice.paid > 0);
      const status = data.length === 0 ? 'Not invoiced' : balance <= 0 ? 'Paid' : hasOverdue ? 'Overdue' : hasPayments ? 'Partial' : 'Unpaid';
      setSummary({ status, balance });
    }).catch(() => {
      if (active) setSummary(null);
    });
    return () => { active = false; };
  }, [customerId]);

  if (!summary) return null;
  const statusClass = summary.status.toLowerCase().replace(/\s+/g, '-');
  return <Link
    to={`/customers/${customerId}?from=clients&tab=invoices`}
    className={`client-payment-status invoice-status-${statusClass}`}
    aria-label={`Payment status ${summary.status}; balance due ₹${summary.balance.toLocaleString('en-IN')}. Open invoices.`}
    title="Open invoices"
  >
    <span>Payment · {summary.status}</span>
    {summary.balance > 0 && <strong>₹{summary.balance.toLocaleString('en-IN')} due</strong>}
  </Link>;
}
