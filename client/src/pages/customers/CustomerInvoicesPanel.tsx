import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Invoice, invoicesApi } from '../../api/invoices';

const panelStyle = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 };
const inputStyle = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--input)', color: 'var(--text)', width: '100%' };
const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function CustomerInvoicesPanel({ customerId }: { customerId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [paymentInvoice, setPaymentInvoice] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [reference, setReference] = useState('');

  const load = useCallback(async () => {
    try { setInvoices((await invoicesApi.list(customerId)).data); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load invoices.'); }
    finally { setLoading(false); }
  }, [customerId]);
  useEffect(() => { void load(); }, [load]);

  async function createInvoice(event: FormEvent) {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      await invoicesApi.create(customerId, { description, amount: Number(amount), discount: Number(discount || 0), ...(dueDate ? { dueDate } : {}) });
      setDescription(''); setAmount(''); setDiscount('0'); setDueDate(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create invoice.'); }
    finally { setSaving(false); }
  }

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      await invoicesApi.addPayment(paymentInvoice, { amount: Number(paymentAmount), method, reference });
      setPaymentInvoice(''); setPaymentAmount(''); setReference(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record payment.'); }
    finally { setSaving(false); }
  }

  const total = invoices.reduce((sum, i) => sum + i.total, 0);
  const paid = invoices.reduce((sum, i) => sum + i.paid, 0);
  const balance = invoices.reduce((sum, i) => sum + i.balance, 0);
  return <div className="customer-invoices-panel" style={{ display: 'grid', gap: 16 }}>
    {error && <div className="notice danger" role="alert">{error}</div>}
    <section style={{ ...panelStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16 }}>
      {[['Total invoiced', total], ['Collected', paid], ['Balance due', balance]].map(([label, value]) => <div key={String(label)}><small style={{ color: 'var(--muted)' }}>{label}</small><div className="invoice-summary-value">{money(Number(value))}</div></div>)}
    </section>
    <form onSubmit={createInvoice} style={panelStyle}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Create invoice</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
        <label>Description<input required maxLength={200} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Monthly marketing package" style={inputStyle} /></label>
        <label>Agreed amount (₹)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></label>
        <label>Discount (₹)<input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} style={inputStyle} /></label>
        <label>Due date (optional)<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} /></label>
      </div>
      <button className="btn primary" disabled={saving} style={{ marginTop: 14 }}>{saving ? 'Saving…' : 'Create invoice'}</button>
    </form>
    <section style={panelStyle}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Invoices</h2>
      {loading ? <p>Loading invoices…</p> : invoices.length === 0 ? <p style={{ color: 'var(--muted)' }}>No invoices yet. Creating an invoice is optional.</p> : <div style={{ display: 'grid', gap: 12 }}>
        {invoices.map(invoice => <article key={invoice._id} className="invoice-item" style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div><strong className="invoice-number">{invoice.invoiceNumber}</strong><div className="invoice-description">{invoice.description}</div><small className="invoice-meta">Issued {new Date(invoice.createdAt).toLocaleDateString('en-IN')} · Due {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'not set'}</small></div>
            <div className="invoice-balance-wrap"><strong className="invoice-balance">{money(invoice.balance)} due</strong><div><span className={`invoice-status invoice-status-${invoice.status}`}>{invoice.status}</span></div></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => void invoicesApi.download(invoice).catch(e => setError(e.message))}>Download invoice PDF</button>
            {invoice.balance > 0 && <button type="button" className="btn primary" onClick={() => { setPaymentInvoice(invoice._id); setPaymentAmount(String(invoice.balance)); }}>Record payment</button>}
          </div>
          {invoice.payments.length > 0 && <div className="invoice-payments"><strong>Payments</strong>{invoice.payments.map(payment => <div key={payment._id} className="invoice-payment-row"><span>{new Date(payment.paidAt).toLocaleDateString('en-IN')} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</span><strong>{money(payment.amount)}</strong></div>)}</div>}
        </article>)}
      </div>}
    </section>
    {paymentInvoice && <form onSubmit={recordPayment} style={panelStyle}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Record payment</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} style={inputStyle} /></label>
        <label>Method<select value={method} onChange={e => setMethod(e.target.value)} style={inputStyle}>{['Cash', 'UPI', 'Bank transfer', 'Card', 'Other'].map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Reference (optional)<input value={reference} onChange={e => setReference(e.target.value)} style={inputStyle} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save payment'}</button><button type="button" className="btn" onClick={() => setPaymentInvoice('')}>Cancel</button></div>
    </form>}
  </div>;
}
