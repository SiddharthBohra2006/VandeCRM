const Invoice = require('../models/Invoice');
const Notification = require('../models/Notification');

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function checkInvoiceRenewals() {
  const dueInvoices = await Invoice.find({
    monthlyRenewal: true,
    nextRenewalDate: { $lte: new Date() },
    createdBy: { $ne: null }
  });
  for (const invoice of dueInvoices) {
    const period = monthKey(invoice.nextRenewalDate);
    if (invoice.renewalPromptedMonth === period) continue;
    const claimed = await Invoice.updateOne(
      { _id: invoice._id, monthlyRenewal: true, renewalPromptedMonth: { $ne: period } },
      { $set: { renewalPromptedMonth: period } }
    );
    if (!claimed.modifiedCount) continue;
    const message = `${invoice.description} is due for renewal for ${period}. Continue for another month or stop the renewal.`;
    const notification = { organization: invoice.organization, user: invoice.createdBy, title: 'Monthly invoice renewal decision', message, link: `/customers/${invoice.customer}?tab=invoices` };
    try {
      if (!(await Notification.exists(notification))) await Notification.create(notification);
    } catch (error) {
      await Invoice.updateOne({ _id: invoice._id, renewalPromptedMonth: period }, { $set: { renewalPromptedMonth: '' } });
      throw error;
    }
  }
}

function startInvoiceRenewalScheduler() {
  if (global.__vandeInvoiceRenewalScheduler) return;
  checkInvoiceRenewals().catch(error => console.error('Initial invoice renewal check failed:', error));
  const timer = setInterval(() => {
    checkInvoiceRenewals().catch(error => console.error('Scheduled invoice renewal check failed:', error));
  }, 60 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  global.__vandeInvoiceRenewalScheduler = timer;
}

module.exports = { checkInvoiceRenewals, startInvoiceRenewalScheduler };
