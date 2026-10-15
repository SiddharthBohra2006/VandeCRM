const express = require('express');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const ClientCompany = require('../models/ClientCompany');
const { hasPermission, isRestrictedUser } = require('../config/roles');
const { requireApiAuth } = require('./middleware/auth');
const { getWonStageIds } = require('../services/crmStages');
const { createInvoicePdf } = require('../utils/invoicePdf');
const { invoiceDiscount, invoiceTotal } = require('../utils/invoiceTotals');

const router = express.Router();
router.use(requireApiAuth);
router.use((req, res, next) => hasPermission(req.user, 'businesses.view') ? next() : res.status(403).json({ ok: false, error: 'Access denied' }));

function workspace(req) { return req.activeCompanyId; }
function scope(req, more = {}) { return { organization: req.user.organization._id, clientCompany: workspace(req), ...more }; }
function totals(invoice) {
  const total = invoiceTotal(invoice);
  const paid = (invoice.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balance = Math.max(0, total - paid);
  const status = balance <= 0 ? 'paid' : paid > 0 ? 'partial' : invoice.dueDate && new Date(invoice.dueDate) < new Date() ? 'overdue' : 'unpaid';
  return { total, paid, balance, status };
}
function serialize(invoice) { return { ...invoice.toObject(), ...totals(invoice) }; }
function addMonth(date) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}
function monthKey(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }
async function findCustomer(req, customerId) {
  if (!mongoose.isValidObjectId(customerId)) return null;
  const filter = { _id: customerId, ...scope(req) };
  if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;
  const customer = await Customer.findOne(filter);
  if (!customer) return null;
  const wonStageIds = await getWonStageIds(req.user.organization._id, workspace(req));
  return wonStageIds.some(stageId => String(stageId) === String(customer.stage)) ? customer : null;
}

router.get('/customers/:customerId', async (req, res, next) => {
  try {
    if (!workspace(req)) return res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
    const customer = await findCustomer(req, req.params.customerId);
    if (!customer) return res.status(404).json({ ok: false, error: 'Client not found.' });
    const invoices = await Invoice.find(scope(req, { customer: customer._id })).sort({ createdAt: -1 });
    res.json({ ok: true, data: invoices.map(serialize) });
  } catch (error) { next(error); }
});

router.post('/customers/:customerId', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.create')) return res.status(403).json({ ok: false, error: 'Access denied' });
    if (!workspace(req)) return res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
    const customer = await findCustomer(req, req.params.customerId);
    if (!customer || !customer.stage) return res.status(404).json({ ok: false, error: 'Client not found.' });
    const amount = Number(req.body.amount);
    const discount = Number(req.body.discount || 0);
    const discountType = req.body.discountType === 'percent' ? 'percent' : 'amount';
    const description = String(req.body.description || '').trim();
    const agreementTerms = String(req.body.agreementTerms || '').trim();
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    const monthlyRenewal = req.body.monthlyRenewal === true;
    const installments = Array.isArray(req.body.installments) ? req.body.installments.map(row => ({
      name: String(row.name || '').trim(), amount: Number(row.amount), dueDate: new Date(row.dueDate)
    })) : [];
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(discount) || discount < 0 || (discountType === 'percent' ? discount >= 100 : discount >= amount) || !description || agreementTerms.length > 2000 || (dueDate && Number.isNaN(dueDate.getTime()))) {
      return res.status(400).json({ ok: false, error: 'Enter a description, a positive amount, a valid discount, and a valid optional due date.' });
    }
    const netAmount = invoiceTotal({ amount, discount, discountType });
    if (installments.length && (installments.some(row => !row.name || row.name.length > 80 || !Number.isFinite(row.amount) || row.amount <= 0 || Number.isNaN(row.dueDate.getTime())) || Math.round(installments.reduce((sum, row) => sum + row.amount, 0) * 100) !== Math.round(netAmount * 100))) {
      return res.status(400).json({ ok: false, error: 'Instalment names, positive amounts, and due dates are required; instalments must total the invoice amount after discount.' });
    }
    if (monthlyRenewal && (!dueDate || installments.length)) return res.status(400).json({ ok: false, error: 'Monthly renewal needs a due date and a single monthly invoice amount.' });
    const company = await ClientCompany.findOne(scope(req));
    if (!company) return res.status(400).json({ ok: false, error: 'Active workspace not found.' });
    const sequence = await ClientCompany.findOneAndUpdate(scope(req), { $inc: { invoiceSequence: 1 } }, { new: true, projection: { invoiceSequence: 1 } });
    const invoice = await Invoice.create({
      ...scope(req), customer: customer._id,
      invoiceNumber: `INV-${String(sequence.invoiceSequence).padStart(5, '0')}`,
      description, agreementTerms, amount, discount, discountType, dueDate, installments, monthlyRenewal,
      nextRenewalDate: monthlyRenewal ? dueDate : null,
      createdBy: req.user._id
    });
    res.status(201).json({ ok: true, data: serialize(invoice) });
  } catch (error) { next(error); }
});

router.post('/:invoiceId/renewal', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) return res.status(403).json({ ok: false, error: 'Access denied' });
    if (!mongoose.isValidObjectId(req.params.invoiceId)) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    const selected = await Invoice.findOne(scope(req, { _id: req.params.invoiceId }));
    if (!selected || !(await findCustomer(req, selected.customer))) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    const rootId = selected.renewalSource || selected._id;
    const root = await Invoice.findOne(scope(req, { _id: rootId, monthlyRenewal: true }));
    if (!root) return res.status(400).json({ ok: false, error: 'This invoice has no active monthly renewal.' });
    if (req.body.action === 'stop') {
      root.monthlyRenewal = false;
      await root.save();
      return res.json({ ok: true, continued: false });
    }
    if (req.body.action !== 'continue' || !root.nextRenewalDate) return res.status(400).json({ ok: false, error: 'Choose Continue or Stop for this monthly renewal.' });
    if (root.renewalPromptedMonth !== monthKey(root.nextRenewalDate)) return res.status(400).json({ ok: false, error: 'The monthly renewal prompt is not due yet.' });
    const nextDueDate = addMonth(root.nextRenewalDate);
    const renewalPeriod = monthKey(nextDueDate);
    let nextInvoice = await Invoice.findOne(scope(req, { renewalSource: root._id, renewalPeriod }));
    if (!nextInvoice) {
      const company = await ClientCompany.findOneAndUpdate(scope(req), { $inc: { invoiceSequence: 1 } }, { new: true, projection: { invoiceSequence: 1 } });
      if (!company) return res.status(400).json({ ok: false, error: 'Active workspace not found.' });
      try {
        nextInvoice = await Invoice.create({
          ...scope(req), customer: root.customer,
          invoiceNumber: `INV-${String(company.invoiceSequence).padStart(5, '0')}`,
          description: root.description, agreementTerms: root.agreementTerms, amount: root.amount, discount: root.discount, discountType: root.discountType,
          dueDate: nextDueDate, createdBy: root.createdBy || req.user._id,
          renewalSource: root._id, renewalPeriod
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        nextInvoice = await Invoice.findOne(scope(req, { renewalSource: root._id, renewalPeriod }));
      }
    }
    root.nextRenewalDate = nextDueDate;
    root.renewalPromptedMonth = '';
    await root.save();
    res.json({ ok: true, continued: true, data: serialize(nextInvoice) });
  } catch (error) { next(error); }
});

router.post('/:invoiceId/payments', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) return res.status(403).json({ ok: false, error: 'Access denied' });
    if (!mongoose.isValidObjectId(req.params.invoiceId)) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    const invoice = await Invoice.findOne(scope(req, { _id: req.params.invoiceId }));
    if (!invoice) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    const customer = await findCustomer(req, invoice.customer);
    if (!customer) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    const amount = Number(req.body.amount);
    const balance = totals(invoice).balance;
    const methods = ['Cash', 'UPI', 'Bank transfer', 'Card', 'Other'];
    const method = methods.includes(req.body.method) ? req.body.method : 'Other';
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) return res.status(400).json({ ok: false, error: `Payment must be greater than zero and no more than the balance (${balance}).` });
    invoice.payments.push({ amount, method, reference: String(req.body.reference || '').trim(), note: String(req.body.note || '').trim(), receivedBy: req.user._id });
    await invoice.save();
    res.json({ ok: true, data: serialize(invoice) });
  } catch (error) { next(error); }
});

router.delete('/:invoiceId', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.delete')) return res.status(403).json({ ok: false, error: 'Access denied' });
    if (!mongoose.isValidObjectId(req.params.invoiceId)) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    const invoice = await Invoice.findOne(scope(req, { _id: req.params.invoiceId }));
    if (!invoice || !(await findCustomer(req, invoice.customer))) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    await invoice.deleteOne();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/:invoiceId/pdf', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.invoiceId)) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    const invoice = await Invoice.findOne(scope(req, { _id: req.params.invoiceId })).populate('customer', 'name company phone email');
    if (!invoice || !(await findCustomer(req, invoice.customer._id))) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
    const company = await ClientCompany.findOne(scope(req)).select('name phone email location');
    const { total, paid, balance, status } = totals(invoice);
    const pdf = createInvoicePdf({
      company: company?.toObject?.() || company || {},
      invoice: invoice.toObject(),
      customer: invoice.customer,
      total,
      paid,
      balance,
      status,
      discountAmount: invoiceDiscount(invoice)
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"` });
    res.send(pdf);
  } catch (error) { next(error); }
});

module.exports = { router, totals };
