function invoiceDiscount(invoice) {
  const amount = Number(invoice.amount || 0);
  const discount = Number(invoice.discount || 0);
  if (invoice.discountType !== 'percent') return discount;
  return Math.round((amount * discount / 100 + Number.EPSILON) * 100) / 100;
}

function invoiceTotal(invoice) {
  return Math.max(0, Number(invoice.amount || 0) - invoiceDiscount(invoice));
}

function dateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function todayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function invoiceNextDueDate(invoice, paid = 0) {
  const installments = [...(invoice.installments || [])].sort((a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)));
  if (!installments.length) return Number(paid) < invoiceTotal(invoice) ? invoice.dueDate || null : null;
  let remainingPaid = Number(paid) || 0;
  for (const installment of installments) {
    const amount = Number(installment.amount) || 0;
    const outstanding = amount - Math.min(amount, remainingPaid);
    remainingPaid = Math.max(0, remainingPaid - amount);
    if (outstanding > 0) return installment.dueDate || null;
  }
  return null;
}

function invoiceIsOverdue(invoice, paid = 0, now = new Date()) {
  const today = todayKey(now);
  const installments = invoice.installments || [];
  if (installments.length) {
    let remainingPaid = Number(paid) || 0;
    return [...installments].sort((a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate))).some(installment => {
      const amount = Number(installment.amount) || 0;
      const outstanding = amount - Math.min(amount, remainingPaid);
      remainingPaid = Math.max(0, remainingPaid - amount);
      const due = dateKey(installment.dueDate);
      return outstanding > 0 && due && due < today;
    });
  }
  const due = dateKey(invoice.dueDate);
  return Number(paid) < invoiceTotal(invoice) && Boolean(due && due < today);
}

module.exports = { invoiceDiscount, invoiceTotal, invoiceIsOverdue, invoiceNextDueDate, dateKey, todayKey };
