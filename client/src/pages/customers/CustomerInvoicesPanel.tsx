import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, CreditCard, Download, FileText, Info, Plus, RotateCcw, Trash2, Wallet, X } from 'lucide-react';
import { Invoice, invoicesApi } from '../../api/invoices';
import DatePicker from '../../components/DatePicker';
import ConfirmDialog from '../../components/ConfirmDialog';

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const localToday = () => { const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset()); return today.toISOString().slice(0, 10); };
const dueDateFor = (invoice: Invoice) => {
  let paid = invoice.paid;
  for (const installment of [...(invoice.installments || [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    if (paid < installment.amount) return installment.dueDate;
    paid -= installment.amount;
  }
  return invoice.balance > 0 ? invoice.dueDate || '' : '';
};

export default function CustomerInvoicesPanel({ customerId }: { customerId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState('');
  const [agreementTerms, setAgreementTerms] = useState('');
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [dueDate, setDueDate] = useState('');
  const [initialPaymentAmount, setInitialPaymentAmount] = useState('');
  const [initialPaymentDate, setInitialPaymentDate] = useState('');
  const [initialPaymentMethod, setInitialPaymentMethod] = useState('UPI');
  const [initialPaymentReference, setInitialPaymentReference] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<'full' | 'installments' | 'monthly'>('full');
  const [installments, setInstallments] = useState<{ name: string; amount: string; dueDate: string }[]>([]);
  const [paymentInvoice, setPaymentInvoice] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [method, setMethod] = useState('UPI');
  const [reference, setReference] = useState('');
  const paymentModalRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'stop-renewal'; invoice: Invoice } | null>(null);

  const load = useCallback(async () => {
    try { setInvoices((await invoicesApi.list(customerId)).data); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load invoices.'); }
    finally { setLoading(false); }
  }, [customerId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!paymentInvoice) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = paymentModalRef.current;
    const bodyChildren = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== modal);
    bodyChildren.forEach(element => element.setAttribute('inert', 'true'));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal?.querySelector<HTMLInputElement>('input')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!savingRef.current) setPaymentInvoice('');
      }
      if (event.key !== 'Tab' || !modal) return;
      const focusable = [
        ...Array.from(modal.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')),
        ...Array.from(document.querySelectorAll<HTMLElement>('.app-date-picker button'))
      ].filter(element => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      bodyChildren.forEach(element => element.removeAttribute('inert'));
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [paymentInvoice]);

  async function createInvoice(event: FormEvent) {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      await invoicesApi.create(customerId, {
        description,
        agreementTerms,
        amount: Number(amount),
        discount: Number(discount || 0),
        discountType,
        ...(dueDate ? { dueDate } : {}),
        ...(Number(initialPaymentAmount) > 0 ? { initialPayment: { amount: Number(initialPaymentAmount), paidAt: initialPaymentDate, method: initialPaymentMethod, reference: initialPaymentReference } } : {}),
        monthlyRenewal: paymentPlan === 'monthly',
        ...(installments.length ? { installments: installments.map(row => ({ ...row, amount: Number(row.amount) })) } : {})
      });
      clearInvoiceDraft();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create invoice.'); }
    finally { setSaving(false); }
  }

  function clearInvoiceDraft() {
    setDescription(''); setAgreementTerms(''); setAmount(''); setDiscount('0'); setDueDate(''); setInitialPaymentAmount(''); setInitialPaymentDate(''); setInitialPaymentMethod('UPI'); setInitialPaymentReference(''); setPaymentPlan('full'); setInstallments([]);
  }

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentDate) return setError('Choose the date the payment was received.');
    try {
      setSaving(true); setError('');
      await invoicesApi.addPayment(paymentInvoice, { amount: Number(paymentAmount), method, reference, paidAt: paymentDate });
      setPaymentInvoice(''); setPaymentAmount(''); setPaymentDate(''); setReference(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record payment.'); }
    finally { setSaving(false); }
  }

  async function deleteInvoice(invoice: Invoice) {
    setConfirmAction({ type: 'delete', invoice });
  }

  async function executeDeleteInvoice(invoice: Invoice) {
    try { setSaving(true); setError(''); await invoicesApi.remove(invoice._id); setConfirmAction(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete invoice.'); }
    finally { setSaving(false); }
  }

  async function handleRenewal(invoice: Invoice, action: 'continue' | 'stop') {
    if (action === 'stop') { setConfirmAction({ type: 'stop-renewal', invoice }); return; }
    await updateRenewal(invoice, action);
  }

  async function updateRenewal(invoice: Invoice, action: 'continue' | 'stop') {
    try { setSaving(true); setError(''); await invoicesApi.renewal(invoice._id, action); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update monthly renewal.'); }
    finally { setSaving(false); }
  }

  async function confirmPendingAction() {
    if (!confirmAction) return;
    if (confirmAction.type === 'delete') await executeDeleteInvoice(confirmAction.invoice);
    else { await updateRenewal(confirmAction.invoice, 'stop'); setConfirmAction(null); }
  }

  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const paid = invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
  const pending = invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  const installmentTotal = installments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const discountAmount = discountType === 'percent'
    ? Math.round((((Number(amount) || 0) * (Number(discount) || 0) / 100) + Number.EPSILON) * 100) / 100
    : Number(discount) || 0;
  const netAmount = Math.max(0, (Number(amount) || 0) - discountAmount);
  const initialPaid = Number(initialPaymentAmount) || 0;
  const initialPaymentValid = initialPaid <= netAmount && (initialPaid === 0 || Boolean(initialPaymentDate));
  const balanceAfterInitialPayment = Math.max(0, netAmount - initialPaid);
  const discountValid = netAmount > 0 && (discountType === 'percent' ? Number(discount) < 100 : discountAmount < (Number(amount) || 0));
  const monthlyRenewal = paymentPlan === 'monthly';
  const downPaymentAmount = paymentPlan === 'installments' && installments[0]?.name.trim().toLowerCase() === 'down payment' ? Number(installments[0].amount) || 0 : 0;
  const scheduleMatches = Math.round(installmentTotal * 100) === Math.round(netAmount * 100);
  const installmentsComplete = installments.every(row => row.name.trim() && Number(row.amount) > 0 && row.dueDate);
  const planComplete = paymentPlan !== 'installments' || (installments.length > 0 && scheduleMatches && installmentsComplete);

  return <div className="customer-invoices-panel invoice-workspace">
    {error && <div className="invoice-alert" role="alert"><Info size={17} aria-hidden="true" />{error}</div>}

    <section className="invoice-metrics" aria-label="Invoice totals">
      <article className="invoice-metric-card">
        <span className="invoice-metric-icon invoice-icon-blue"><FileText size={20} aria-hidden="true" /></span>
        <div><span className="invoice-metric-label">Total invoiced</span><strong>{money(total)}</strong></div>
      </article>
      <article className="invoice-metric-card">
        <span className="invoice-metric-icon invoice-icon-green"><Wallet size={20} aria-hidden="true" /></span>
        <div><span className="invoice-metric-label">Collected</span><strong>{money(paid)}</strong></div>
      </article>
      <article className="invoice-metric-card">
        <span className="invoice-metric-icon invoice-icon-orange"><Clock3 size={20} aria-hidden="true" /></span>
        <div><span className="invoice-metric-label">Pending amount</span><strong>{money(pending)}</strong></div>
      </article>
    </section>

    <form className="invoice-card invoice-create-card" onSubmit={createInvoice}>
      <header className="invoice-section-heading">
        <div><h2>New invoice</h2><p>Set the service, price and how the client will pay.</p></div>
        <span className="invoice-heading-icon"><FileText size={19} aria-hidden="true" /></span>
      </header>

      <div className="invoice-form-grid">
        <label className="invoice-field invoice-field-description"><span className="invoice-field-label">Service <b>*</b></span>
          <input required maxLength={200} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Website redesign and launch" />
        </label>
        <label className="invoice-field"><span className="invoice-field-label">Agreed amount (₹) <b>*</b></span>
          <input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
        </label>
        <div className="invoice-field invoice-discount-field"><span className="invoice-field-label">Discount</span>
          <div className="invoice-discount-control">
            <input aria-label={discountType === 'percent' ? 'Discount percent' : 'Discount amount in rupees'} type="number" min="0" max={discountType === 'percent' ? '99.99' : amount ? String(Math.max(0, Number(amount) - 0.01)) : undefined} step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
            <div className="invoice-discount-options" role="group" aria-label="Discount type">
              <button type="button" className={discountType === 'percent' ? 'is-active' : ''} aria-pressed={discountType === 'percent'} onClick={() => setDiscountType('percent')}>%</button>
              <button type="button" className={discountType === 'amount' ? 'is-active' : ''} aria-pressed={discountType === 'amount'} onClick={() => setDiscountType('amount')}>₹</button>
            </div>
          </div>
          <small>{discountType === 'percent' ? `${Number(discount || 0)}% · ` : ''}{money(discountAmount)} off · {money(netAmount)} invoice total</small>
        </div>
      </div>

      <details className="invoice-terms-toggle">
        <summary>Add agreement details <span>Optional</span></summary>
        <label className="invoice-field invoice-field-terms"><span className="invoice-field-label">Deliverables or terms</span>
          <textarea maxLength={2000} rows={3} value={agreementTerms} onChange={e => setAgreementTerms(e.target.value)} placeholder="Add scope, deliverables or service period." />
        </label>
      </details>

      <section className="invoice-payment-plan">
        <h3>How will they pay?</h3>
        <div className="invoice-plan-options" role="group" aria-label="Payment plan">
          <button type="button" className={paymentPlan === 'full' ? 'is-active' : ''} aria-pressed={paymentPlan === 'full'} onClick={() => { setPaymentPlan('full'); setInstallments([]); }}>Full payment</button>
          <button type="button" className={paymentPlan === 'installments' ? 'is-active' : ''} aria-pressed={paymentPlan === 'installments'} onClick={() => { setPaymentPlan('installments'); setDueDate(''); setInstallments(rows => rows.length ? rows : [{ name: 'Down payment', amount: '', dueDate: localToday() }]); }}>Down payment + instalments</button>
          <button type="button" className={paymentPlan === 'monthly' ? 'is-active' : ''} aria-pressed={paymentPlan === 'monthly'} onClick={() => { setPaymentPlan('monthly'); setInstallments([]); }}>Monthly renewal</button>
        </div>
        {paymentPlan === 'monthly' && <p className="invoice-plan-hint">You’ll be asked each month before another invoice is created. No automatic charges.</p>}
        {paymentPlan !== 'installments' && <label className="invoice-field invoice-field-date"><span className="invoice-field-label">{paymentPlan === 'monthly' ? 'First payment due' : 'Due date'}{monthlyRenewal ? <b>*</b> : <small>Optional</small>}</span>
          <DatePicker className="invoice-date-picker" value={dueDate} onChange={setDueDate} placeholder="dd-mm-yyyy" displayFormat="dmy" aria-label={paymentPlan === 'monthly' ? 'First payment due date' : 'Invoice due date'} />
        </label>}
      </section>

      <section className="invoice-initial-payment">
        <div className="invoice-subheading-row"><div><h3>Payment already received <span>Optional</span></h3><p>Enter an upfront payment here so it appears in the paid history.</p></div></div>
        <div className="invoice-initial-payment-fields">
          <label className="invoice-field">Amount received (₹)<input type="number" min="0" max={netAmount || undefined} step="0.01" value={initialPaymentAmount} onChange={e => setInitialPaymentAmount(e.target.value)} placeholder="0.00" /></label>
          {initialPaid > 0 && <>
            <label className="invoice-field">Date received<DatePicker className="invoice-date-picker" value={initialPaymentDate} onChange={setInitialPaymentDate} placeholder="dd-mm-yyyy" displayFormat="dmy" aria-label="Date payment received" /></label>
            <label className="invoice-field">Method<select value={initialPaymentMethod} onChange={e => setInitialPaymentMethod(e.target.value)}>{['Cash', 'UPI', 'Bank transfer', 'Card', 'Other'].map(item => <option key={item}>{item}</option>)}</select></label>
            <label className="invoice-field">Reference <small>Optional</small><input value={initialPaymentReference} onChange={e => setInitialPaymentReference(e.target.value)} placeholder="Transaction ID" /></label>
          </>}
        </div>
        {initialPaid > 0 && <div className="invoice-initial-payment-summary"><span>Paid now <strong>{money(initialPaid)}</strong></span><span>Remaining after payment <strong>{money(balanceAfterInitialPayment)}</strong></span></div>}
        {!initialPaymentValid && <p className="invoice-inline-hint">Enter a valid payment date and an amount no greater than the invoice total.</p>}
      </section>

      <section className="invoice-agreement-summary" aria-label="Payment summary">
        <div><span>Total after discount</span><strong>{money(netAmount)}</strong></div>
        <div><span>{paymentPlan === 'installments' ? 'Scheduled down payment' : paymentPlan === 'monthly' ? 'Monthly amount' : 'Amount due after payment'}</span><strong>{paymentPlan === 'installments' ? (downPaymentAmount ? money(downPaymentAmount) : 'Add amount below') : paymentPlan === 'monthly' ? money(netAmount) : money(balanceAfterInitialPayment)}</strong></div>
        {initialPaid > 0 && <div><span>Paid so far</span><strong>{money(initialPaid)}</strong></div>}
        {(paymentPlan === 'installments' || initialPaid > 0) && <div><span>Still due</span><strong>{money(balanceAfterInitialPayment)}</strong></div>}
      </section>

      {paymentPlan === 'installments' && <section className="invoice-installment-editor">
        <div className="invoice-subheading-row">
          <div><h3>Payment schedule</h3><p>Add each payment and its due date. The first row is the down payment.</p></div>
          <button type="button" className="invoice-button invoice-button-secondary" onClick={() => setInstallments(rows => [...rows, { name: `Instalment ${rows.length}`, amount: '', dueDate: '' }])}><Plus size={16} aria-hidden="true" /> Add payment</button>
        </div>
        {installments.length > 0 && <div className="invoice-installment-rows">
          {installments.map((row, index) => <div className="invoice-installment-row" key={index}>
            <label className="invoice-field">Instalment name<input required value={row.name} onChange={e => { const value = e.currentTarget.value; setInstallments(rows => rows.map((item, i) => i === index ? { ...item, name: value } : item)); }} placeholder={`Instalment ${index + 1}`} /></label>
            <label className="invoice-field">Amount (₹)<input required type="number" min="0.01" step="0.01" value={row.amount} onChange={e => { const value = e.currentTarget.value; setInstallments(rows => rows.map((item, i) => i === index ? { ...item, amount: value } : item)); }} placeholder="0.00" /></label>
            <label className="invoice-field">Due date<DatePicker className="invoice-date-picker" value={row.dueDate} onChange={value => setInstallments(rows => rows.map((item, i) => i === index ? { ...item, dueDate: value } : item))} placeholder="dd-mm-yyyy" displayFormat="dmy" aria-label={`${row.name || `Instalment ${index + 1}`} due date`} /></label>
            <button type="button" className="invoice-button invoice-remove-button" aria-label={`Remove ${row.name || `instalment ${index + 1}`}`} onClick={() => setInstallments(rows => rows.filter((_, i) => i !== index))}><Trash2 size={16} aria-hidden="true" /><span>Remove</span></button>
          </div>)}
          <div className={`invoice-schedule-total${scheduleMatches ? ' is-valid' : ' is-invalid'}`}><span>Schedule total <strong>{money(installmentTotal)}</strong></span><span>Invoice after discount <strong>{money(netAmount)}</strong></span></div>
          {!installmentsComplete && <p className="invoice-inline-hint">Enter a name, amount and due date for every payment.</p>}
        </div>}
      </section>}

      <footer className="invoice-form-actions">
        <button className="invoice-button invoice-button-primary" disabled={saving || !discountValid || !initialPaymentValid || (monthlyRenewal && !dueDate) || !planComplete}><FileText size={17} aria-hidden="true" />{saving ? 'Creating…' : 'Create invoice'}</button>
        <button type="button" className="invoice-button invoice-button-secondary" onClick={clearInvoiceDraft}>Cancel</button>
        <span>PDF invoice is ready to download after saving.</span>
      </footer>
    </form>

    <section className="invoice-card invoice-list-card">
      <header className="invoice-list-heading"><div><h2>Invoices</h2><p>{invoices.length ? `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'} for this client` : 'Your invoices and payment history will appear here.'}</p></div></header>
      {loading ? <div className="invoice-empty-state"><span className="invoice-loading-dot" />Loading invoices…</div> : invoices.length === 0 ? <div className="invoice-empty-state"><span className="invoice-empty-icon"><FileText size={22} aria-hidden="true" /></span><strong>No invoices yet</strong><span>Create the first invoice using the form above.</span></div> : <div className="invoice-list">
        {invoices.map(invoice => <article key={invoice._id} className="invoice-item">
          <div className="invoice-item-main">
            <div className="invoice-item-title"><span className="invoice-file-icon"><FileText size={17} aria-hidden="true" /></span><div><strong>{invoice.invoiceNumber}</strong><span>{invoice.description}</span><small>Issued {date(invoice.createdAt)} <i>·</i> Next due {dueDateFor(invoice) ? date(dueDateFor(invoice)) : 'Not set'}</small></div></div>
            <div className="invoice-item-balance"><strong>{money(invoice.balance)}</strong><span className={`invoice-status invoice-status-${invoice.status}`}>{invoice.status}</span></div>
          </div>
          <div className="invoice-progress-track" role="progressbar" aria-label={`${invoice.invoiceNumber} payment progress`} aria-valuenow={invoice.total > 0 ? Math.round(invoice.paid / invoice.total * 100) : 0} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${invoice.total > 0 ? Math.min(100, invoice.paid / invoice.total * 100) : 0}%` }} /></div>
          <div className="invoice-item-totals"><span>Total <strong>{money(invoice.total)}</strong></span><span>Paid <strong className="invoice-paid-value">{money(invoice.paid)}</strong></span><span>Pending <strong className="invoice-pending-value">{money(invoice.balance)}</strong></span></div>
          <div className="invoice-item-actions">
            <button type="button" className="invoice-button invoice-button-secondary" onClick={() => void invoicesApi.download(invoice).catch(e => setError(e.message))}><Download size={16} aria-hidden="true" />Download PDF</button>
            {invoice.balance > 0 && <button type="button" className="invoice-button invoice-button-primary" onClick={() => { setError(''); setPaymentInvoice(invoice._id); setPaymentAmount(String(invoice.balance)); setPaymentDate(localToday()); }}><CreditCard size={16} aria-hidden="true" />Record payment</button>}
            <button type="button" className="invoice-button invoice-delete-button" onClick={() => void deleteInvoice(invoice)}><Trash2 size={16} aria-hidden="true" />Delete</button>
          </div>
          {invoice.monthlyRenewal && <div className="invoice-renewal-status"><RotateCcw size={17} aria-hidden="true" /><div><strong>Monthly renewal</strong><span>{invoice.renewalPromptedMonth ? 'Your decision is due' : 'Next decision'} · {invoice.nextRenewalDate ? date(invoice.nextRenewalDate) : 'Date not set'}</span></div><div className="invoice-renewal-actions"><button type="button" className="invoice-button invoice-button-primary" disabled={!invoice.renewalPromptedMonth} onClick={() => void handleRenewal(invoice, 'continue')}>Continue</button><button type="button" className="invoice-button invoice-button-secondary" onClick={() => void handleRenewal(invoice, 'stop')}>Stop renewal</button></div></div>}
          {invoice.installments?.length > 0 && <div className="invoice-detail-block"><h3>Payment schedule</h3>{(() => { let remainingPaid = invoice.paid; return [...invoice.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((row, index) => { const rowPaid = Math.min(row.amount, remainingPaid); remainingPaid -= rowPaid; const rowBalance = row.amount - rowPaid; const dueKey = row.dueDate.slice(0, 10); const overdue = rowBalance > 0 && dueKey < localToday(); return <div className="invoice-detail-row" key={row._id || index}><span><strong>{row.name}</strong><small>{date(row.dueDate)} · {rowBalance <= 0 ? 'Paid' : overdue ? 'Overdue' : rowPaid > 0 ? 'Partially paid' : 'Upcoming'}</small></span><span><strong className="invoice-paid-value">{money(rowPaid)} paid</strong><small>of {money(row.amount)} · {money(rowBalance)} pending</small></span></div>; }); })()}</div>}
          {invoice.agreementTerms && <div className="invoice-detail-block"><h3>Agreement terms & deliverables</h3><p className="invoice-agreement-terms">{invoice.agreementTerms}</p></div>}
          {invoice.payments.length > 0 && <div className="invoice-detail-block"><h3>Payment history</h3>{[...invoice.payments].sort((a, b) => a.paidAt.localeCompare(b.paidAt)).map(payment => <div className="invoice-detail-row" key={payment._id}><span><strong>{payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</strong><small>{date(payment.paidAt)}</small></span><strong className="invoice-paid-value">{money(payment.amount)}</strong></div>)}</div>}
        </article>)}
      </div>}
    </section>

    {paymentInvoice && createPortal(<div ref={paymentModalRef} className="invoice-payment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invoice-payment-title" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setPaymentInvoice(''); }}>
      <form className="invoice-payment-form invoice-payment-modal" onSubmit={recordPayment}>
      <header className="invoice-section-heading"><div><h2 id="invoice-payment-title">Record payment</h2><p>Save the payment against this invoice balance.</p></div><button type="button" className="invoice-payment-modal-close" aria-label="Close payment form" disabled={saving} onClick={() => setPaymentInvoice('')}><X size={19} /></button></header>
      {error && <div className="invoice-alert" role="alert"><Info size={17} aria-hidden="true" />{error}</div>}
      <div className="invoice-form-grid">
        <label className="invoice-field">Amount (₹) <span>*</span><input required type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></label>
        <label className="invoice-field">Date received <span>*</span><DatePicker className="invoice-date-picker" value={paymentDate} onChange={setPaymentDate} placeholder="dd-mm-yyyy" displayFormat="dmy" aria-label="Date payment received" /></label>
        <label className="invoice-field">Method <span>*</span><select value={method} onChange={e => setMethod(e.target.value)}>{['Cash', 'UPI', 'Bank transfer', 'Card', 'Other'].map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="invoice-field invoice-field-description">Transaction reference <small>Optional</small><input value={reference} onChange={e => setReference(e.target.value)} placeholder="UPI reference or transaction ID" /></label>
      </div>
      <footer className="invoice-form-actions"><button className="invoice-button invoice-button-primary" disabled={saving}><CreditCard size={17} aria-hidden="true" />{saving ? 'Saving…' : 'Save payment'}</button><button type="button" className="invoice-button invoice-button-secondary" disabled={saving} onClick={() => setPaymentInvoice('')}>Cancel</button></footer>
      </form>
    </div>, document.body)}

    <ConfirmDialog
      open={Boolean(confirmAction)}
      title={confirmAction?.type === 'delete' ? 'Delete this invoice?' : 'Stop monthly renewal?'}
      message={confirmAction?.type === 'delete' ? `Delete invoice ${confirmAction.invoice.invoiceNumber}? Its payment history will be removed. Any monthly invoices already created will remain.` : `Stop monthly renewal for invoice ${confirmAction?.invoice.invoiceNumber}? No more monthly invoices will be created.`}
      confirmText={confirmAction?.type === 'delete' ? 'Delete invoice' : 'Stop renewal'}
      variant="danger"
      loading={saving}
      onConfirm={() => void confirmPendingAction()}
      onCancel={() => setConfirmAction(null)}
    />
  </div>;
}
