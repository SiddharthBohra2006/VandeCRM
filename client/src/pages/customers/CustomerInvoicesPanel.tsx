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
  const [monthlyRenewal, setMonthlyRenewal] = useState(false);
  const [installments, setInstallments] = useState<{ name: string; amount: string; dueDate: string }[]>([]);
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
      await invoicesApi.create(customerId, { description, amount: Number(amount), discount: Number(discount || 0), ...(dueDate ? { dueDate } : {}), monthlyRenewal, ...(installments.length ? { installments: installments.map(row => ({ ...row, amount: Number(row.amount) })) } : {}) });
      setDescription(''); setAmount(''); setDiscount('0'); setDueDate(''); setInstallments([]); setMonthlyRenewal(false); await load();
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

  async function deleteInvoice(invoice: Invoice) {
    if (!window.confirm(`Delete invoice ${invoice.invoiceNumber}? This will also remove its payment history.`)) return;
    try { setSaving(true); await invoicesApi.remove(invoice._id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete invoice.'); }
    finally { setSaving(false); }
  }

  async function handleRenewal(invoice: Invoice, action: 'continue' | 'stop') {
    try {
      setSaving(true); setError('');
      await invoicesApi.renewal(invoice._id, action);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update monthly renewal.'); }
    finally { setSaving(false); }
  }

  const total = invoices.reduce((sum, i) => sum + i.total, 0);
  const paid = invoices.reduce((sum, i) => sum + i.paid, 0);
  const balance = invoices.reduce((sum, i) => sum + i.balance, 0);
  const installmentTotal = installments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const netAmount = (Number(amount) || 0) - (Number(discount) || 0);
  return <div className="customer-invoices-panel" style={{ display: 'grid', gap: 16 }}>
    {error && <div className="notice danger" role="alert">{error}</div>}
    <section style={{ ...panelStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16 }}>
      {[['Total invoiced', total], ['Collected', paid], ['Pending amount', balance]].map(([label, value]) => <div key={String(label)}><small style={{ color: 'var(--muted)' }}>{label}</small><div className="invoice-summary-value">{money(Number(value))}</div></div>)}
    </section>
    <form onSubmit={createInvoice} style={panelStyle}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Create invoice</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
        <label>Description<input required maxLength={200} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Monthly marketing package" style={inputStyle} /></label>
        <label>Agreed amount (₹)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></label>
        <label>Discount (₹)<input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} style={inputStyle} /></label>
        <label>Due date{monthlyRenewal ? ' (required for renewal)' : ' (optional)'}<input type="date" required={monthlyRenewal} value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} /></label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}><input type="checkbox" checked={monthlyRenewal} disabled={installments.length > 0} onChange={e => setMonthlyRenewal(e.target.checked)} />Ask me each month before creating the next invoice</label>
      {monthlyRenewal && <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>The due date is the first renewal prompt. Continue creates the next month’s invoice; payments are still recorded manually.</small>}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><strong>Instalment schedule (optional)</strong><button type="button" className="btn" disabled={monthlyRenewal} onClick={() => setInstallments(rows => [...rows, { name: `Instalment ${rows.length + 1}`, amount: '', dueDate: '' }])}>+ Add instalment</button></div>
        {installments.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginTop: 10 }}>
          <label>Instalment name<input required value={row.name} onChange={e => { const value = e.currentTarget.value; setInstallments(rows => rows.map((item, i) => i === index ? { ...item, name: value } : item)); }} style={inputStyle} /></label>
          <label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={row.amount} onChange={e => { const value = e.currentTarget.value; setInstallments(rows => rows.map((item, i) => i === index ? { ...item, amount: value } : item)); }} style={inputStyle} /></label>
          <label>Due date<input required type="date" value={row.dueDate} onChange={e => { const value = e.currentTarget.value; setInstallments(rows => rows.map((item, i) => i === index ? { ...item, dueDate: value } : item)); }} style={inputStyle} /></label>
          <button type="button" className="btn" onClick={() => setInstallments(rows => rows.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        {installments.length > 0 && <small style={{ display: 'block', marginTop: 8, color: Math.round(installmentTotal * 100) === Math.round(netAmount * 100) ? 'var(--green)' : 'var(--red)' }}>Schedule total: {money(installmentTotal)} / Invoice after discount: {money(netAmount)}</small>}
      </div>
      <button className="btn primary" disabled={saving || (monthlyRenewal && !dueDate) || (installments.length > 0 && Math.round(installmentTotal * 100) !== Math.round(netAmount * 100))} style={{ marginTop: 14 }}>{saving ? 'Saving…' : 'Create invoice'}</button>
    </form>
    <section style={panelStyle}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Invoices</h2>
      {loading ? <p>Loading invoices…</p> : invoices.length === 0 ? <p style={{ color: 'var(--muted)' }}>No invoices yet. Creating an invoice is optional.</p> : <div style={{ display: 'grid', gap: 12 }}>
        {invoices.map(invoice => <article key={invoice._id} className="invoice-item" style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div><strong className="invoice-number">{invoice.invoiceNumber}</strong><div className="invoice-description">{invoice.description}</div><small className="invoice-meta">Issued {new Date(invoice.createdAt).toLocaleDateString('en-IN')} · Due {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'not set'}</small></div>
            <div className="invoice-balance-wrap"><strong className="invoice-balance">{money(invoice.balance)} pending</strong><div><span className={`invoice-status invoice-status-${invoice.status}`}>{invoice.status}</span></div></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => void invoicesApi.download(invoice).catch(e => setError(e.message))}>Download invoice PDF</button>
            {invoice.balance > 0 && <button type="button" className="btn primary" onClick={() => { setPaymentInvoice(invoice._id); setPaymentAmount(String(invoice.balance)); }}>Record payment</button>}
            <button type="button" className="btn" disabled={saving} onClick={() => void deleteInvoice(invoice)}>Delete invoice</button>
          </div>
          {invoice.monthlyRenewal && <div className="invoice-payments"><strong>Monthly renewal</strong><div className="invoice-payment-row"><span>{invoice.renewalPromptedMonth ? 'Decision needed' : 'Next decision'} · {invoice.nextRenewalDate ? new Date(invoice.nextRenewalDate).toLocaleDateString('en-IN') : 'date not set'}</span><span style={{ display: 'flex', gap: 8 }}><button type="button" className="btn primary" disabled={saving || !invoice.renewalPromptedMonth} onClick={() => void handleRenewal(invoice, 'continue')}>Continue</button><button type="button" className="btn" disabled={saving} onClick={() => void handleRenewal(invoice, 'stop')}>Stop renewal</button></span></div></div>}
          {invoice.payments.length > 0 && <div className="invoice-payments"><strong>Payments</strong>{invoice.payments.map(payment => <div key={payment._id} className="invoice-payment-row"><span>{new Date(payment.paidAt).toLocaleDateString('en-IN')} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</span><strong>{money(payment.amount)}</strong></div>)}</div>}
          {invoice.installments?.length > 0 && <div className="invoice-payments"><strong>Instalments</strong>{(() => { let remainingPaid = invoice.paid; return [...invoice.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((row, index) => { const rowPaid = Math.min(row.amount, remainingPaid); remainingPaid -= rowPaid; const rowBalance = row.amount - rowPaid; const overdue = rowBalance > 0 && new Date(row.dueDate) < new Date(); return <div key={row._id || index} className="invoice-payment-row"><span>{row.name} · due {new Date(row.dueDate).toLocaleDateString('en-IN')} · {rowBalance <= 0 ? 'Paid' : overdue ? 'Overdue' : rowPaid > 0 ? 'Partial' : 'Upcoming'}</span><strong>{money(rowBalance)} pending</strong></div>; }); })()}</div>}
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
