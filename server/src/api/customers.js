const express = require('express');
const Activity = require('../models/Activity');
const Attachment = require('../models/Attachment');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const CrmLabel = require('../models/CrmLabel');
const CrmStage = require('../models/CrmStage');
const CustomField = require('../models/CustomField');
const CustomRecord = require('../models/CustomRecord');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const SavedView = require('../models/SavedView');
const SyncLog = require('../models/SyncLog');
const User = require('../models/User');
const WorkType = require('../models/WorkType');
const { hasPermission, hasWorkPermission, isRestrictedUser, canAccessLeadField } = require('../config/roles');
const { runLeadAutomation } = require('../services/automation');
const { getWonStageIds } = require('../services/crmStages');
const { logAudit } = require('../utils/audit');
const { parseCsv, rowsToObjects, normalizeCustomerCsv, toCsv, suggestCustomerHeader } = require('../utils/csv');
const { potentialFilter } = require('../utils/leadPotential');
const { requireApiAuth } = require('./middleware/auth');
const getRateLimiter = require('./middleware/rateLimiter');

const exportLimiter = getRateLimiter(30, 60 * 1000);
const importLimiter = getRateLimiter(10, 60 * 1000);

const router = express.Router();
router.use(requireApiAuth);
router.use((req, res, next) => hasPermission(req.user, 'businesses.view') ? next() : res.status(403).json({ ok: false, error: 'Access denied' }));

const isManager = user => ['admin', 'manager'].includes(user.role);
const selectedIds = value => (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(id => /^[a-f\d]{24}$/i.test(id));
const labels = value => Array.isArray(value) ? value : value ? [value] : [];
const csvHeaders = ['name', 'company', 'email', 'phone', 'source', 'value', 'priority', 'leadScore', 'stage', 'labels', 'notes', 'campaign', 'nextFollowUpAt'];
const normalizePhone = value => { const clean = String(value || '').replace(/\D/g, ''); return clean.length >= 10 ? clean.slice(-10) : clean; };
const normalizeNameForKey = value => { const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); return normalized.length >= 2 ? normalized : ''; };

function workspace(req, res) {
  if (req.activeCompanyId) return String(req.activeCompanyId);
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

function scope(req, extra = {}) {
  return {
    organization: req.user.organization._id,
    clientCompany: req.activeCompanyId,
    ...(isRestrictedUser(req.user) ? { assignedTo: req.user._id } : {}),
    ...extra
  };
}

const permits = permission => (req, res, next) => hasPermission(req.user, permission)
  ? next()
  : res.status(403).json({ ok: false, error: 'Access denied' });

async function formOptions(req) {
  const organization = req.user.organization._id;
  const companyFilter = { organization, status: 'active' };
  if (!isManager(req.user)) companyFilter.assignedUsers = req.user._id;
  const [stages, availableLabels, fields, companies, users] = await Promise.all([
    CrmStage.find({ organization, clientCompany: req.activeCompanyId }).sort({ order: 1, createdAt: 1 }),
    CrmLabel.find({ organization, clientCompany: req.activeCompanyId, isActive: true }).sort({ name: 1 }),
    CustomField.find({ organization, clientCompany: req.activeCompanyId, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
    ClientCompany.find(companyFilter).sort({ name: 1 }),
    User.find({ organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }).sort({ name: 1 })
  ]);
  const campaigns = await Campaign.find({ organization, clientCompany: req.activeCompanyId, status: 'active' }).sort({ name: 1 });
  return { stages, labels: availableLabels, fields, companies, campaigns, users };
}

async function validateRelations(req, body) {
  const organization = req.user.organization._id;
  const activeWorkspace = req.activeCompanyId;
  const checks = [];
  if (body.stage) checks.push(CrmStage.exists({ _id: body.stage, organization, clientCompany: activeWorkspace, isActive: true }).then(Boolean));
  if (body.campaign) checks.push(Campaign.exists({ _id: body.campaign, organization, clientCompany: activeWorkspace, status: 'active' }).then(Boolean));
  if (body.assignedTo && isManager(req.user)) checks.push(User.exists({ _id: body.assignedTo, organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }).then(Boolean));
  const requestedLabels = labels(body.labels);
  if (requestedLabels.length) checks.push(CrmLabel.countDocuments({ _id: { $in: requestedLabels }, organization, clientCompany: activeWorkspace, isActive: true }).then(count => count === requestedLabels.length));
  return (await Promise.all(checks)).every(Boolean);
}

function input(body, fields, user, existing = null) {
  const currentCustomData = existing?.customData?.toObject?.() || Object.fromEntries(existing?.customData || []);
  const requestedCustomData = body.customData && typeof body.customData === 'object' ? body.customData : {};
  for (const field of fields) {
    if (canAccessLeadField(user, field.key, 'edit') && Object.hasOwn(requestedCustomData, field.key)) {
      currentCustomData[field.key] = requestedCustomData[field.key];
    }
  }
  return {
    name: String(body.name || '').trim(),
    company: String(body.company || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    source: String(body.source || 'Manual').trim(),
    value: Math.max(0, Number(body.value) || 0),
    priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium',
    leadScore: Math.max(0, Math.min(100, Number(body.leadScore) || 0)),
    stage: body.stage,
    labels: labels(body.labels),
    campaign: body.campaign || null,
    notes: String(body.notes || ''),
    customData: currentCustomData
  };
}

function sanitizeCustomerCustomData(customer, user) {
  if (!customer || !user) return customer;
  const isDoc = typeof customer.toObject === 'function';
  const plain = isDoc ? customer.toObject() : { ...customer };
  if (!plain.customData) return plain;
  const filtered = {};
  const entries = plain.customData instanceof Map
    ? plain.customData.entries()
    : typeof plain.customData.entries === 'function'
      ? plain.customData.entries()
      : Object.entries(plain.customData);
  for (const [k, v] of entries) {
    if (canAccessLeadField(user, k, 'view')) {
      filtered[k] = v;
    }
  }
  plain.customData = filtered;
  return plain;
}

function importedFollowUp(value) {
  if (!value) return null;
  const text = String(value).trim();
  const indian = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  const date = indian
    ? new Date(Number(indian[3]), Number(indian[2]) - 1, Number(indian[1]), Number(indian[4] || 9), Number(indian[5] || 0))
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

const IMPORT_RESERVED_KEYS = new Set(['name', 'company', 'email', 'phone', 'source', 'value', 'priority', 'leadscore', 'stage', 'labels', 'notes', 'clientcompany', 'campaign', 'nextfollowupat', 'followupcomment']);

function importSlug(value) {
  return String(value || '').replace(/^custom[_\s-]+/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function importKeyForHeader(header) {
  const key = importSlug(header);
  return key && !IMPORT_RESERVED_KEYS.has(key) ? key : null;
}

function importLabelFromHeader(header) {
  return String(header || '').replace(/^custom[_\s-]+/i, '').replace(/[_-]+/g, ' ').trim().replace(/\s+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function isImportHistoryHeader(header) {
  const key = importSlug(header);
  return key === 'time' || key === 'next_follow_up_date_and_time' || /^\d+_[a-z]+_follow_up$/.test(key) || /^\d+(st|nd|rd|th)_whatsapp_msg$/.test(key);
}

function foldImportHistory(row) {
  const history = Object.entries(row).filter(([header, value]) => isImportHistoryHeader(header) && String(value || '').trim());
  history.forEach(([header]) => delete row[header]);
  if (history.length) row.notes = [row.notes, ...history.map(([header, value]) => `${importLabelFromHeader(header)}: ${value}`)].filter(Boolean).join('\n');
  return row;
}

function inferImportFieldType(values) {
  const filled = values.map(value => String(value || '').trim()).filter(Boolean);
  if (!filled.length) return 'text';
  if (filled.every(value => ['true', 'false', 'yes', 'no', '1', '0', 'on', 'off'].includes(value.toLowerCase()))) return 'checkbox';
  if (filled.every(value => !Number.isNaN(Number(value)))) return 'number';
  if (filled.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))) return 'date';
  return 'text';
}

function csvBody(req) {
  return typeof req.body === 'string' ? req.body : String(req.body?.csvData || '');
}

async function csvContext(req) {
  const organization = req.user.organization._id;
  const [stages, availableLabels, campaigns, existingCustomers, allFields, activeUsers] = await Promise.all([
    CrmStage.find({ organization, clientCompany: req.activeCompanyId, isActive: true }).sort({ order: 1, createdAt: 1 }),
    CrmLabel.find({ organization, clientCompany: req.activeCompanyId, isActive: true }),
    Campaign.find({ organization, clientCompany: req.activeCompanyId, status: 'active' }),
    Customer.find(scope(req)),
    CustomField.find({ organization, clientCompany: req.activeCompanyId, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
    User.find({ organization, isActive: { $ne: false } }).select('_id name role')
  ]);
  const fields = allFields.filter(f => canAccessLeadField(req.user, f.key, 'view'));
  return {
    stages,
    fields,
    users: activeUsers,
    userById: new Map(activeUsers.map(u => [String(u._id), u])),
    stageByName: new Map(stages.map(item => [item.name.toLowerCase(), item])),
    labelByName: new Map(availableLabels.map(item => [item.name.toLowerCase(), item])),
    campaignByName: new Map(campaigns.map(item => [item.name.toLowerCase(), item])),
    customerByEmail: new Map(existingCustomers.filter(item => item.email).map(item => [item.email.toLowerCase(), item])),
    customerByPhone: new Map(existingCustomers.filter(item => item.phoneNormalized || item.phone).map(item => [item.phoneNormalized || normalizePhone(item.phone), item]))
  };
}

router.get('/export/csv', exportLimiter, async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const organization = req.user.organization._id;
    const wonStageIds = await getWonStageIds(organization, req.activeCompanyId);
    const createdAt = {};
    const from = new Date(req.query.dateFrom); const to = new Date(req.query.dateTo);
    if (req.query.dateFrom && !Number.isNaN(from.getTime())) createdAt.$gte = from;
    if (req.query.dateTo && !Number.isNaN(to.getTime())) { to.setHours(23, 59, 59, 999); createdAt.$lte = to; }
    const customers = await Customer.find(scope(req, {
      stage: req.query.scope === 'clients' ? { $in: wonStageIds } : { $nin: wonStageIds },
      ...(Object.keys(createdAt).length ? { createdAt } : {})
    })).populate('stage labels clientCompany campaign').sort({ updatedAt: -1 });
    const allFields = await CustomField.find({ organization, clientCompany: req.activeCompanyId, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 });
    const fields = allFields.filter(field => canAccessLeadField(req.user, field.key, 'view'));
    const headers = [...csvHeaders, ...fields.map(field => `custom_${field.key}`)];
    const rows = customers.map(customer => {
      const row = {
        name: customer.name, company: customer.company, email: customer.email, phone: customer.phone,
        source: customer.source, value: customer.value, priority: customer.priority, leadScore: customer.leadScore,
        stage: customer.stage?.name || '', labels: customer.labels.map(label => label.name).join('|'), notes: customer.notes,
        campaign: customer.campaign?.name || '', nextFollowUpAt: customer.nextFollowUpAt?.toISOString() || ''
      };
      fields.forEach(field => { row[`custom_${field.key}`] = customer.customData?.get(field.key) ?? ''; });
      return row;
    });
    const name = req.query.scope === 'clients' ? 'clients.csv' : 'leads.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(toCsv(headers, rows));
  } catch (error) { next(error); }
});

router.get('/import-template.csv', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    if (!workspace(req, res)) return;
    const allFields = await CustomField.find({ organization, clientCompany: req.activeCompanyId, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 });
    const fields = allFields.filter(field => canAccessLeadField(req.user, field.key, 'view'));
    const headers = [...csvHeaders, ...fields.map(field => `custom_${field.key}`)];
    const sample = {
      name: 'Rahul Sharma',
      company: 'Sample Brand Pvt Ltd',
      email: 'rahul@example.com',
      phone: '9876543210',
      source: 'Website',
      value: '50000',
      priority: 'high',
      leadScore: '80',
      stage: 'New Lead',
      labels: 'HP|Retainer',
      notes: 'Imported sample row. Delete before uploading real data.',
      campaign: 'Bootcamp',
      nextFollowUpAt: ''
    };
    fields.forEach(field => {
      if (field.type === 'select') sample[`custom_${field.key}`] = field.options[0] || '';
      else if (field.type === 'checkbox') sample[`custom_${field.key}`] = 'yes';
      else if (field.type === 'number') sample[`custom_${field.key}`] = '10000';
      else if (field.type === 'date') sample[`custom_${field.key}`] = '2026-07-02';
      else sample[`custom_${field.key}`] = '';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vande-agency-import-template.csv"');
    res.send(toCsv(headers, [sample]));
  } catch (error) { next(error); }
});

router.post('/import/preview', permits('businesses.create'), express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '4mb' }), async (req, res, next) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ ok: false, error: 'Access denied' });
    if (!workspace(req, res)) return;
    const text = csvBody(req);
    if (!text.trim()) return res.status(400).json({ ok: false, error: 'CSV data is required.' });
    const rows = rowsToObjects(normalizeCustomerCsv(parseCsv(text), new Map(Object.entries(req.body?.mappings || {}))));
    const context = await csvContext(req);
    const duplicateRule = ['update', 'skip', 'create'].includes(req.body?.duplicateRule) ? req.body.duplicateRule : 'update';
    const previewRows = rows.map((row, index) => {
      const email = String(row.email || '').trim().toLowerCase();
      const phone = normalizePhone(row.phone);
      const existing = (email && context.customerByEmail.get(email)) || (phone && context.customerByPhone.get(phone));
      const messages = [];
      if (!row.name && !row.phone && !row.email) messages.push('Name, phone, or email is required.');
      if (row.stage && !context.stageByName.has(String(row.stage).toLowerCase())) messages.push(`Unknown stage "${row.stage}"; the default stage will be used.`);
      if (row.campaign && !context.campaignByName.has(String(row.campaign).toLowerCase())) messages.push(`Unknown campaign "${row.campaign}"; it will be left empty.`);
      const status = messages[0]?.startsWith('Name') || (existing && duplicateRule === 'skip') ? 'skip' : existing && duplicateRule === 'update' ? 'update' : 'create';
      if (status !== 'skip') {
        const simulated = existing || { name: row.name, email, phoneNormalized: phone };
        if (email) context.customerByEmail.set(email, simulated);
        if (phone) context.customerByPhone.set(phone, simulated);
      }
      return { rowNumber: index + 2, status, name: row.name || row.company || row.phone || row.email, email, phone: row.phone || '', messages };
    });
    res.json({ ok: true, preview: { headers: normalizeCustomerCsv(parseCsv(text), new Map(Object.entries(req.body?.mappings || {})))[0] || [], totalRows: rows.length, createCount: previewRows.filter(row => row.status === 'create').length, updateCount: previewRows.filter(row => row.status === 'update').length, skipCount: previewRows.filter(row => row.status === 'skip').length, rows: previewRows } });
  } catch (error) { next(error); }
});

router.post('/import', importLimiter, permits('businesses.create'), express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '4mb' }), async (req, res, next) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ ok: false, error: 'Access denied' });
    if (!workspace(req, res)) return;
    const text = csvBody(req);
    if (!text.trim()) return res.status(400).json({ ok: false, error: 'CSV data is required.' });
    const normalized = normalizeCustomerCsv(parseCsv(text), new Map(Object.entries(req.body?.mappings || {})));
    const normalizedHeaders = normalized[0] || [];
    const rows = rowsToObjects(normalized).map(foldImportHistory);
    const context = await csvContext(req);
    const existingKeys = new Set(context.fields.map(field => field.key));
    let nextOrder = context.fields.reduce((max, field) => Math.max(max, field.order || 0), 0) + 10;
    for (const header of normalizedHeaders) {
      const key = importKeyForHeader(header);
      if (!key || existingKeys.has(key)) continue;
      await CustomField.create({
        organization: req.user.organization._id,
        clientCompany: req.activeCompanyId,
        entity: 'customer',
        label: importLabelFromHeader(header),
        key,
        type: inferImportFieldType(rows.map(row => (row[header] !== undefined ? (row[header] ?? '') : (row[`custom_${key}`] ?? '')))),
        options: [],
        required: false,
        order: nextOrder,
        isActive: true
      });
      existingKeys.add(key);
      nextOrder += 10;
    }
    context.fields = await CustomField.find({ organization: req.user.organization._id, clientCompany: req.activeCompanyId, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 });
    context.fields = context.fields.filter(field => canAccessLeadField(req.user, field.key, 'view'));
    let defaultStage = context.stages.find(stage => String(stage._id) === String(req.body?.defaultStageId)) || null;
    const isClientScope = String(req.body?.scope) === 'clients';
    if (isClientScope) {
      if (!defaultStage || !defaultStage.isWon) {
        defaultStage = context.stages.find(stage => stage.isWon && stage.isActive)
          || context.stages.find(stage => stage.isWon)
          || context.stages.find(stage => stage.isDefault)
          || defaultStage;
      }
    } else if (!defaultStage) {
      defaultStage = context.stages.find(stage => stage.isDefault) || context.stages[0];
    }
    if (!defaultStage) return res.status(400).json({ ok: false, error: 'Create an active CRM stage before importing leads.' });
    const defaultAssignedTo = (req.body?.defaultAssignedToId && context.userById.get(String(req.body.defaultAssignedToId))) ? req.body.defaultAssignedToId : req.user._id;
    const duplicateRule = ['update', 'skip', 'create'].includes(req.body?.duplicateRule) ? req.body.duplicateRule : 'update';
    let imported = 0; let updated = 0; let skipped = 0;
    for (const row of rows) {
      if (!row.name && !row.phone && !row.email) { skipped += 1; continue; }
      const email = String(row.email || '').trim().toLowerCase();
      const phone = normalizePhone(row.phone);
      const existing = duplicateRule === 'create' ? null : (email && context.customerByEmail.get(email)) || (phone && context.customerByPhone.get(phone));
      if (existing && duplicateRule === 'skip') { skipped += 1; continue; }
      const stage = context.stageByName.get(String(row.stage || '').toLowerCase()) || defaultStage;
      const campaign = context.campaignByName.get(String(row.campaign || '').toLowerCase()) || null;
      const selectedLabels = String(row.labels || '').split('|').map(name => context.labelByName.get(name.trim().toLowerCase())?._id).filter(Boolean);
      const customData = {};
      context.fields.filter(field => canAccessLeadField(req.user, field.key, 'edit')).forEach(field => {
        const matchingHeader = Object.keys(row).find(header => importSlug(header) === field.key);
        const raw = row[`custom_${field.key}`] || row[field.key] || (matchingHeader ? row[matchingHeader] : '');
        customData[field.key] = field.type === 'checkbox' ? ['true', 'yes', '1', 'on'].includes(String(raw).toLowerCase()) : field.type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
      });
      const followUpDate = importedFollowUp(row.nextFollowUpAt || req.body?.defaultNextFollowUpAt);
      const followUpComment = String(row.followUpComment || req.body?.defaultFollowUpComment || '').trim().slice(0, 1000);

      if (existing) {
        const previousImportStage = existing.stage;
        existing.set({
          name: row.name || existing.name,
          company: row.company || existing.company,
          email: email || existing.email,
          phone: row.phone || existing.phone,
          source: row.source || existing.source,
          value: (row.value === undefined || row.value === '') ? existing.value : Math.max(0, Number(row.value) || 0),
          priority: ['low', 'medium', 'high'].includes(String(row.priority).toLowerCase()) ? String(row.priority).toLowerCase() : existing.priority,
          leadScore: (row.leadScore === undefined || row.leadScore === '') ? existing.leadScore : Math.max(0, Math.min(100, Number(row.leadScore) || 0)),
          stage: row.stage ? stage : existing.stage,
          labels: [...new Set([...(existing.labels || []).map(String), ...selectedLabels.map(String)])],
          campaign: campaign?._id || existing.campaign,
          notes: row.notes ? [existing.notes, row.notes].filter(Boolean).join('\n---\nImported note: ') : existing.notes,
          customData: { ...(existing.customData instanceof Map ? Object.fromEntries(existing.customData) : (existing.customData || {})), ...customData },
          ...(followUpDate ? { nextFollowUpAt: followUpDate } : {})
        });
        await existing.save();
        if (String(previousImportStage || '') !== String(existing.stage || '')) {
          await runLeadAutomation({ customer: existing, trigger: 'stage_changed', previousStage: previousImportStage });
        }
        if (followUpDate) {
          await Activity.create({
            organization: req.user.organization._id,
            customer: existing._id,
            user: req.user._id,
            type: 'task',
            note: `Follow-up scheduled for ${followUpDate.toLocaleString('en-IN')}.`,
            nextFollowUpAt: followUpDate,
            followUpAction: 'scheduled',
            comment: followUpComment
          });
        }
        if (existing.email) context.customerByEmail.set(existing.email.toLowerCase(), existing);
        if (existing.phoneNormalized) context.customerByPhone.set(existing.phoneNormalized, existing);
        updated += 1;
      } else {
        const customer = await Customer.create({
          organization: req.user.organization._id,
          clientCompany: req.activeCompanyId,
          name: row.name || row.company || row.phone || row.email,
          company: row.company || '',
          email,
          phone: row.phone || '',
          source: row.source || 'CSV Import',
          value: Math.max(0, Number(row.value) || 0),
          priority: ['low', 'medium', 'high'].includes(String(row.priority).toLowerCase()) ? String(row.priority).toLowerCase() : 'medium',
          leadScore: Math.max(0, Math.min(100, Number(row.leadScore) || 0)),
          stage,
          labels: selectedLabels,
          assignedTo: defaultAssignedTo,
          campaign: campaign?._id || null,
          notes: row.notes || '',
          customData,
          ...(followUpDate ? { nextFollowUpAt: followUpDate } : {})
        });
        await runLeadAutomation({ customer, trigger: 'lead_created' });
        if (followUpDate) {
          await Activity.create({
            organization: req.user.organization._id,
            customer: customer._id,
            user: req.user._id,
            type: 'task',
            note: `Follow-up scheduled for ${followUpDate.toLocaleString('en-IN')}.`,
            nextFollowUpAt: followUpDate,
            followUpAction: 'scheduled',
            comment: followUpComment
          });
        }
        if (customer.email) context.customerByEmail.set(customer.email, customer);
        if (customer.phoneNormalized) context.customerByPhone.set(customer.phoneNormalized, customer);
        imported += 1;
      }
    }
    await SyncLog.create({ organization: req.user.organization._id, source: 'CSV Import', status: 'success', recordsProcessed: rows.length, recordsCreated: imported, recordsUpdated: updated });
    await logAudit(req, { action: 'import', entityType: 'customer', message: `CSV import completed. Created ${imported}, updated ${updated}, skipped ${skipped}.`, metadata: { imported, updated, skipped, rows: rows.length } });
    res.json({ ok: true, imported, updated, skipped });
  } catch (error) { next(error); }
});

router.post('/bulk', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ ok: false, error: 'Access denied' });
    const ids = selectedIds(req.body.selectedIds);
    if (!ids.length) return res.status(400).json({ ok: false, error: 'Select at least one lead.' });
    const customers = await Customer.find(scope(req, { _id: { $in: ids } })).populate('assignedTo stage');
    if (!customers.length) return res.status(404).json({ ok: false, error: 'No matching leads found.' });
    const action = String(req.body.action || '');
    const customerIds = customers.map(customer => customer._id);
    let update;
    let note;
    if (action === 'delete') {
      if (!hasPermission(req.user, 'businesses.delete')) return res.status(403).json({ ok: false, error: 'Access denied' });
      await Promise.all([
        Activity.deleteMany({ organization: req.user.organization._id, customer: { $in: customerIds } }),
        Attachment.deleteMany({ organization: req.user.organization._id, customer: { $in: customerIds } }),
        Customer.deleteMany(scope(req, { _id: { $in: customerIds } }))
      ]);
      await logAudit(req, { action: 'bulk_delete', entityType: 'customer', message: `Bulk deleted ${customers.length} lead(s).`, metadata: { count: customers.length, ids: customerIds } });
      return res.json({ ok: true, message: `${customers.length} lead(s) deleted.` });
    }
    if (action === 'stage') {
      const stage = await CrmStage.findOne({ _id: req.body.stageId || req.body.stage, organization: req.user.organization._id, clientCompany: req.activeCompanyId, isActive: true });
      if (!stage) return res.status(400).json({ ok: false, error: 'Choose a valid stage.' });
      update = { $set: { stage: stage._id } }; note = `Bulk update: stage changed to ${stage.name}.`;
    } else if (action === 'transfer') {
      const assignee = req.body.assignedTo ? await User.findOne({ _id: req.body.assignedTo, organization: req.user.organization._id, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }) : null;
      if (req.body.assignedTo && !assignee) return res.status(400).json({ ok: false, error: 'Choose a valid active user.' });
      update = { $set: { assignedTo: assignee?._id || null } }; note = `Bulk update: lead assigned to ${assignee?.name || 'Unassigned'}.`;
      if (assignee && String(assignee._id) !== String(req.user._id)) await Notification.create({ organization: req.user.organization._id, user: assignee._id, title: 'Bulk Lead Transfer', message: `${customers.length} lead(s) were assigned to you by ${req.user.name}.`, link: '/customers' });
    } else if (action === 'priority' && ['low', 'medium', 'high'].includes(req.body.priority)) {
      update = { $set: { priority: req.body.priority } }; note = `Bulk update: priority set to ${req.body.priority}.`;
    } else if (action === 'value' && Number.isFinite(Number(req.body.value)) && Number(req.body.value) >= 0) {
      update = { $set: { value: Number(req.body.value) } }; note = `Bulk update: lead value set to Rs. ${Number(req.body.value).toLocaleString('en-IN')}.`;
    } else if (action === 'source' && String(req.body.source || '').trim()) {
      update = { $set: { source: String(req.body.source).trim() } }; note = `Bulk update: source set to ${String(req.body.source).trim()}.`;
    } else return res.status(400).json({ ok: false, error: 'Choose a supported bulk action with a valid value.' });
    await Customer.updateMany(scope(req, { _id: { $in: customerIds } }), update);
    await Activity.insertMany(customers.map(customer => ({ organization: req.user.organization._id, customer: customer._id, user: req.user._id, type: action === 'stage' ? 'stage_changed' : 'note', note })));
    await logAudit(req, { action: `bulk_${action}`, entityType: 'customer', message: `Bulk ${action} applied to ${customers.length} lead(s).`, metadata: { action, count: customers.length } });
    res.json({ ok: true, message: `${customers.length} lead(s) updated.` });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const { q = '', stage = '', label = '', campaign = '', sortBy = 'recent', view = 'all', dateFrom = '', dateTo = '' } = req.query;
    const options = await formOptions(req);
    const wonStageIds = await getWonStageIds(req.user.organization._id, req.activeCompanyId);
    const filter = scope(req, stage ? { stage } : { stage: { $nin: wonStageIds } });
    if (label) filter.labels = label;
    if (campaign) filter.campaign = campaign;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      const from = new Date(dateFrom); const to = new Date(dateTo);
      if (dateFrom && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
      if (dateTo && !Number.isNaN(to.getTime())) { to.setHours(23, 59, 59, 999); filter.createdAt.$lte = to; }
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (view === 'recent') filter.updatedAt = { $gte: sevenDaysAgo };
    else if (view === 'new') filter.createdAt = { $gte: sevenDaysAgo };
    else if (view === 'high-value') filter.value = { $gte: 50000 };
    else if (view === 'assigned') filter.assignedTo = req.user._id;
    else if (view === 'overdue' || view === 'followup') filter.nextFollowUpAt = { $lt: new Date() };
    else if (view === 'stale') {
      const staleCutoff = new Date(); staleCutoff.setDate(staleCutoff.getDate() - 14);
      filter.$or = [{ lastContactedAt: { $exists: false } }, { lastContactedAt: null }, { lastContactedAt: { $lt: staleCutoff } }];
    }
    else if (view === 'potential' || view === 'hot') Object.assign(filter, potentialFilter(options.labels, options.stages));
    else if (view === 'qualified') filter.stage = { $in: options.stages.filter(item => /qualified/i.test(item.name)).map(item => item._id) };
    if (q) {
      const escaped = String(q).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const textConditions = ['name', 'company', 'email', 'phone'].map(key => ({ [key]: { $regex: escaped, $options: 'i' } }));
      if (filter.$or) filter.$or = [...filter.$or, ...textConditions];
      else filter.$or = textConditions;
    }
    const sorts = { recent: { updatedAt: -1 }, old: { updatedAt: 1 }, 'highest-value': { value: -1 }, 'lowest-value': { value: 1 }, name: { name: 1 } };
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
    const totalResults = await Customer.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const [customers, savedViews] = await Promise.all([
      Customer.find(filter).populate('stage labels assignedTo clientCompany campaign').sort(sorts[sortBy] || sorts.recent).skip((page - 1) * pageSize).limit(pageSize),
      SavedView.find({ organization: req.user.organization._id, user: req.user._id, entity: 'customer' }).sort({ updatedAt: -1 })
    ]);
    const statsFilter = scope(req, { stage: { $nin: wonStageIds } });
    const qualified = options.stages.filter(item => !item.isWon && /qualified/i.test(item.name)).map(item => item._id);
    const [totalLeads, newLeads, qualifiedLeads, hotLeads, overdueLeads] = await Promise.all([
      Customer.countDocuments(statsFilter), Customer.countDocuments({ ...statsFilter, createdAt: { $gte: sevenDaysAgo } }),
      qualified.length ? Customer.countDocuments({ ...statsFilter, stage: { $in: qualified } }) : 0,
      Customer.countDocuments({ ...statsFilter, ...potentialFilter(options.labels, options.stages) }), Customer.countDocuments({ ...statsFilter, nextFollowUpAt: { $lt: new Date() } })
    ]);
    res.json({ ok: true, data: customers.map(c => sanitizeCustomerCustomData(c, req.user)), ...options, fields: options.fields.filter(field => canAccessLeadField(req.user, field.key, 'view')), savedViews, leadStats: { totalLeads, newLeads, qualifiedLeads, hotLeads, overdueLeads }, pagination: { page, pageSize, totalPages, totalResults } });
  } catch (error) { next(error); }
});

router.post('/', permits('businesses.create'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    if (!String(req.body.name || '').trim()) return res.status(400).json({ ok: false, error: 'Name is required.' });
    const options = await formOptions(req);
    const firstStage = options.stages.find(stage => stage.isDefault && stage.isActive) || options.stages.find(stage => stage.isActive);
    if (!req.body.stage) req.body.stage = firstStage?._id;
    if (!req.body.stage) return res.status(400).json({ ok: false, error: 'Create an active CRM stage before adding leads.' });
    let targetWorkspace = req.activeCompanyId;
    if (req.body.clientCompany && String(req.body.clientCompany) !== String(req.activeCompanyId)) {
      if (!isManager(req.user) || !/^[a-f\d]{24}$/i.test(String(req.body.clientCompany))) return res.status(403).json({ ok: false, error: 'Cannot create a lead in that CRM.' });
      const validCompany = await ClientCompany.findOne({ _id: req.body.clientCompany, organization: req.user.organization._id, status: { $ne: 'inactive' } });
      if (!validCompany) return res.status(400).json({ ok: false, error: 'Choose an accessible active CRM.' });
      targetWorkspace = String(validCompany._id);
    }
    const customer = await Customer.create({ organization: req.user.organization._id, clientCompany: targetWorkspace, ...input(req.body, options.fields, req.user), assignedTo: isManager(req.user) ? (req.body.assignedTo || req.user._id) : req.user._id });
    await runLeadAutomation({ customer, trigger: 'lead_created' });
    await Activity.create({ organization: req.user.organization._id, customer: customer._id, user: req.user._id, type: 'note', note: 'Customer created.' });
    await logAudit(req, { action: 'create', entityType: 'customer', entityId: customer._id, entityName: customer.name, message: `Lead "${customer.name}" created.` });
    res.status(201).json({ ok: true, data: await customer.populate('stage labels assignedTo clientCompany campaign') });
  } catch (error) { next(error); }
});

function addDuplicate(groups, key, reason, customer) {
  if (!key) return;
  if (!groups.has(key)) groups.set(key, { key, reason, customers: [] });
  groups.get(key).customers.push(customer);
}

async function mergeDuplicateCustomer({ organization, primary, duplicate, user }) {
  if (!primary.company && duplicate.company) primary.company = duplicate.company;
  if (!primary.email && duplicate.email) primary.email = duplicate.email;
  if (!primary.phone && duplicate.phone) primary.phone = duplicate.phone;
  if (!primary.source && duplicate.source) primary.source = duplicate.source;
  if (!primary.clientCompany && duplicate.clientCompany) primary.clientCompany = duplicate.clientCompany;
  if (!primary.campaign && duplicate.campaign) primary.campaign = duplicate.campaign;
  if (!primary.assignedTo && duplicate.assignedTo) primary.assignedTo = duplicate.assignedTo;
  if (!primary.lastContactedAt && duplicate.lastContactedAt) primary.lastContactedAt = duplicate.lastContactedAt;
  if (!primary.nextFollowUpAt && duplicate.nextFollowUpAt) primary.nextFollowUpAt = duplicate.nextFollowUpAt;
  primary.value = Math.max(Number(primary.value || 0), Number(duplicate.value || 0));

  const primaryLabels = new Set((primary.labels || []).map(l => String(l._id || l)));
  (duplicate.labels || []).forEach(l => {
    const lid = String(l._id || l);
    if (!primaryLabels.has(lid)) primary.labels.push(l);
  });

  const mergedCustomData = {};
  if (primary.customData) {
    const entries = typeof primary.customData.entries === 'function' ? primary.customData.entries() : Object.entries(primary.customData);
    for (const [k, v] of entries) mergedCustomData[k] = v;
  }
  if (duplicate.customData) {
    const entries = typeof duplicate.customData.entries === 'function' ? duplicate.customData.entries() : Object.entries(duplicate.customData);
    for (const [k, v] of entries) {
      if (mergedCustomData[k] === undefined || mergedCustomData[k] === '') {
        mergedCustomData[k] = v;
      }
    }
  }
  primary.customData = mergedCustomData;

  if (duplicate.notes) {
    primary.notes = primary.notes
      ? `${primary.notes}\n---\nMerged duplicate note from ${duplicate.name}: ${duplicate.notes}`
      : `Merged duplicate note from ${duplicate.name}: ${duplicate.notes}`;
  }

  await Activity.updateMany({ organization, customer: duplicate._id }, { $set: { customer: primary._id } });
  await Attachment.updateMany({ organization, customer: duplicate._id }, { $set: { customer: primary._id } });
  await primary.save();
  await Customer.deleteOne({ _id: duplicate._id, organization });

  await Activity.create({
    organization,
    customer: primary._id,
    user: user._id,
    type: 'note',
    note: `Merged duplicate lead "${duplicate.name}" into this profile.`,
  });
}

// GET /api/customers/duplicates — List duplicate lead groups
router.get('/duplicates', async (req, res, next) => {
  try {
    if (!isManager(req.user)) {
      return res.status(403).json({ ok: false, error: 'Access denied.' });
    }
    const organization = req.user.organization._id;
    const customers = await Customer.find(scope(req))
      .populate('stage labels assignedTo clientCompany campaign')
      .sort({ updatedAt: -1 });

    const groups = new Map();
    customers.forEach(customer => {
      addDuplicate(groups, customer.email ? `email:${customer.email.toLowerCase()}` : '', 'Same email', customer);
      addDuplicate(groups, normalizePhone(customer.phone) ? `phone:${normalizePhone(customer.phone)}` : '', 'Same phone', customer);
      const nameKey = normalizeNameForKey(customer.name);
      addDuplicate(groups, nameKey ? `name:${nameKey}` : '', 'Same name', customer);
    });

    const duplicateGroups = Array.from(groups.values())
      .filter(group => group.customers.length > 1)
      .map(group => ({
        ...group,
        customers: group.customers.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      }))
      .sort((a, b) => b.customers.length - a.customers.length);

    res.json({ ok: true, duplicateGroups });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers/duplicates/merge — Merge duplicate lead
router.post('/duplicates/merge', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!isManager(req.user)) {
      return res.status(403).json({ ok: false, error: 'Access denied.' });
    }
    const organization = req.user.organization._id;
    const { primaryId, duplicateId } = req.body;
    if (!primaryId || !duplicateId || String(primaryId) === String(duplicateId)) {
      return res.status(400).json({ ok: false, error: 'Choose two different leads to merge.' });
    }

    const [primary, duplicate] = await Promise.all([
      Customer.findOne(scope(req, { _id: primaryId })),
      Customer.findOne(scope(req, { _id: duplicateId })),
    ]);

    if (!primary || !duplicate) {
      return res.status(404).json({ ok: false, error: 'One of the selected leads could not be found.' });
    }

    const sameEmail = primary.email && duplicate.email && primary.email.toLowerCase() === duplicate.email.toLowerCase();
    const samePhone = normalizePhone(primary.phone) && normalizePhone(primary.phone) === normalizePhone(duplicate.phone);
    const nameKey = normalizeNameForKey(primary.name);
    const sameName = nameKey && nameKey === normalizeNameForKey(duplicate.name);
    if (!sameEmail && !samePhone && !sameName) {
      return res.status(400).json({ ok: false, error: 'Selected leads do not share the same email, phone, or name.' });
    }

    await mergeDuplicateCustomer({ organization, primary, duplicate, user: req.user });
    await logAudit(req, {
      action: 'merge',
      entityType: 'customer',
      entityId: primary._id,
      entityName: primary.name,
      message: `Merged duplicate lead "${duplicate.name}" into "${primary.name}".`,
      metadata: { duplicateId },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id })).populate('stage labels assignedTo clientCompany campaign');
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });
    const visibleWorkTypes = (await WorkType.find({ organization: req.user.organization._id, clientCompany: req.activeCompanyId, isActive: true })).filter(type => hasWorkPermission(req.user, type, 'view'));
    const workScope = { organization: req.user.organization._id, workspace: req.activeCompanyId, module: { $in: visibleWorkTypes.map(type => type._id) }, customer: customer._id, ...(isRestrictedUser(req.user) ? { $or: [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }] } : {}) };
    const [activities, attachments, relatedWork, options] = await Promise.all([
      Activity.find({ organization: req.user.organization._id, customer: customer._id }).populate('user', 'name').sort({ createdAt: -1 }),
      Attachment.find({ organization: req.user.organization._id, customer: customer._id }).select('-data').populate('uploadedBy', 'name').sort({ createdAt: -1 }),
      CustomRecord.find(workScope).populate('module assignedTo collaborators secondaryAssignee parentRecord').sort({ createdAt: -1 }),
      formOptions(req)
    ]);
    res.json({ ok: true, data: sanitizeCustomerCustomData(customer, req.user), activities, attachments, relatedWork, stages: options.stages, labels: options.labels, users: options.users, campaigns: options.campaigns, fields: options.fields.filter(field => canAccessLeadField(req.user, field.key, 'view')) });
  } catch (error) { next(error); }
});

router.put('/:id', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id }));
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });
    if (!String(req.body.name || customer.name).trim()) return res.status(400).json({ ok: false, error: 'Name is required.' });
    const options = await formOptions(req);
    const merged = { ...customer.toObject(), ...req.body };
    if (!await validateRelations(req, merged)) return res.status(403).json({ ok: false, error: 'One or more selected relationships are invalid.' });
    const previousStage = customer.stage; const previousOwner = customer.assignedTo;
    customer.set(input(merged, options.fields, req.user, customer));
    customer.clientCompany = req.activeCompanyId;
    if (isManager(req.user)) customer.assignedTo = req.body.assignedTo || null;
    await customer.save();
    if (String(previousStage || '') !== String(customer.stage || '')) await runLeadAutomation({ customer, trigger: 'stage_changed', previousStage });
    if (String(previousOwner || '') !== String(customer.assignedTo || '')) await runLeadAutomation({ customer, trigger: 'owner_changed' });
    await logAudit(req, { action: 'update', entityType: 'customer', entityId: customer._id, entityName: customer.name, message: `Lead "${customer.name}" updated.` });
    res.json({ ok: true, data: await customer.populate('stage labels assignedTo clientCompany campaign') });
  } catch (error) { next(error); }
});

// POST /api/customers/:id/activity — Log an activity (note, call, email, whatsapp, meeting, task)
router.post('/:id/activity', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const organization = req.user.organization._id;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id }));
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });

    const allowedTypes = ['note', 'call', 'email', 'whatsapp', 'meeting', 'meeting_client', 'meeting_internal', 'stage_changed', 'label_changed', 'task'];
    const type = allowedTypes.includes(req.body.type) ? req.body.type : 'note';
    const callRecordingUrl = String(req.body.callRecordingUrl || '').trim().slice(0, 2000);

    const activity = await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type,
      note: req.body.note || '',
      callRecordingUrl,
      nextFollowUpAt: req.body.nextFollowUpAt || null,
    });

    customer.lastContactedAt = new Date();
    if (req.body.nextFollowUpAt) {
      customer.nextFollowUpAt = new Date(req.body.nextFollowUpAt);
    }
    await customer.save();

    await logAudit(req, {
      action: 'activity_create',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `${activity.type} activity logged for "${customer.name}".`,
    });

    res.json({ ok: true, data: await activity.populate('user', 'name') });
  } catch (error) { next(error); }
});

// POST /api/customers/:id/stage — Inline change lead stage
router.post('/:id/stage', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const organization = req.user.organization._id;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id })).populate('stage');
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });

    const stage = await CrmStage.findOne({ _id: req.body.stageId, organization, clientCompany: req.activeCompanyId, isActive: true });
    if (!stage) return res.status(400).json({ ok: false, error: 'Invalid stage selected.' });

    const previousStageName = customer.stage?.name || 'None';
    const previousStageId = customer.stage?._id || customer.stage;
    customer.stage = stage._id;
    await customer.save();

    if (String(previousStageId || '') !== String(stage._id)) {
      await runLeadAutomation({ customer, trigger: 'stage_changed', previousStage: previousStageId });
    }

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'stage_changed',
      note: `Stage changed from ${previousStageName} to ${stage.name}.`,
    });

    await logAudit(req, {
      action: 'stage_change',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Stage changed from ${previousStageName} to ${stage.name}.`,
    });

    res.json({ ok: true, stage });
  } catch (error) { next(error); }
});

// POST /api/customers/:id/transfer — Inline transfer lead owner
router.post('/:id/transfer', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    if (!isManager(req.user)) return res.status(403).json({ ok: false, error: 'Access denied.' });
    const organization = req.user.organization._id;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id })).populate('assignedTo');
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });

    const newAssigneeId = req.body.assignedTo || null;
    let newAssigneeName = 'Unassigned';
    if (newAssigneeId) {
      const newUser = await User.findOne({ _id: newAssigneeId, organization, isActive: true });
      if (newUser) newAssigneeName = newUser.name;
    }

    const previousOwnerName = customer.assignedTo?.name || 'Unassigned';
    const previousOwnerId = customer.assignedTo?._id || customer.assignedTo;
    customer.assignedTo = newAssigneeId;
    await customer.save();

    if (String(previousOwnerId || '') !== String(newAssigneeId || '')) {
      await runLeadAutomation({ customer, trigger: 'owner_changed' });
    }

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'note',
      note: `Lead ownership transferred from ${previousOwnerName} to ${newAssigneeName}.`,
    });

    await logAudit(req, {
      action: 'transfer',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Lead transferred from ${previousOwnerName} to ${newAssigneeName}.`,
    });

    res.json({ ok: true, assignedTo: customer.assignedTo });
  } catch (error) { next(error); }
});

function parseAttachmentPayload(body) {
  const rawData = String(body.fileData || '');
  const match = rawData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { ok: false, message: 'Please select a valid file before uploading.' };
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return { ok: false, message: 'Selected file is empty.' };
  if (buffer.length > 3 * 1024 * 1024) return { ok: false, message: 'Attachment must be 3 MB or smaller.' };
  const originalName = String(body.originalName || 'attachment').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return {
    ok: true,
    buffer,
    mimeType: match[1] || 'application/octet-stream',
    originalName: originalName || 'attachment',
    category: ['proposal', 'contract', 'invoice', 'brief', 'screenshot', 'other'].includes(body.category) ? body.category : 'other',
    notes: String(body.notes || '').trim(),
  };
}

// POST /api/customers/:id/attachments — Upload file attachment
router.post('/:id/attachments', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const organization = req.user.organization._id;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id }));
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });

    const payload = parseAttachmentPayload(req.body);
    if (!payload.ok) return res.status(400).json({ ok: false, error: payload.message });

    const attachment = await Attachment.create({
      organization,
      customer: customer._id,
      clientCompany: customer.clientCompany || null,
      uploadedBy: req.user._id,
      category: payload.category,
      originalName: payload.originalName,
      mimeType: payload.mimeType,
      size: payload.buffer.length,
      notes: payload.notes,
      data: payload.buffer,
    });

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'note',
      note: `Attachment uploaded: ${attachment.originalName}.`,
    });

    await logAudit(req, {
      action: 'attachment_upload',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Attachment "${attachment.originalName}" uploaded to lead "${customer.name}".`,
    });

    res.status(201).json({
      ok: true,
      attachment: {
        _id: attachment._id,
        originalName: attachment.originalName,
        category: attachment.category,
        size: attachment.size,
        notes: attachment.notes,
        createdAt: attachment.createdAt,
        uploadedBy: { _id: req.user._id, name: req.user.name },
      },
    });
  } catch (error) { next(error); }
});

// GET /api/customers/:id/attachments/:attachmentId/download — Download file attachment
router.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const organization = req.user.organization._id;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id }));
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });

    const attachment = await Attachment.findOne({ _id: req.params.attachmentId, organization, customer: customer._id });
    if (!attachment) return res.status(404).json({ ok: false, error: 'Attachment not found.' });

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', attachment.size || attachment.data.length);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName.replace(/"/g, '')}"`);
    res.send(attachment.data);
  } catch (error) { next(error); }
});

// DELETE /api/customers/:id/attachments/:attachmentId — Delete file attachment
router.delete('/:id/attachments/:attachmentId', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const organization = req.user.organization._id;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id }));
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });

    const attachment = await Attachment.findOne({ _id: req.params.attachmentId, organization, customer: customer._id });
    if (!attachment) return res.status(404).json({ ok: false, error: 'Attachment not found.' });

    const canDelete = isManager(req.user) || String(attachment.uploadedBy || '') === String(req.user._id);
    if (!canDelete) return res.status(403).json({ ok: false, error: 'Access denied.' });

    await Attachment.deleteOne({ _id: attachment._id, organization });
    await logAudit(req, {
      action: 'attachment_delete',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Attachment "${attachment.originalName}" removed from lead "${customer.name}".`,
    });

    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.delete('/:id', permits('businesses.delete'), async (req, res, next) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ ok: false, error: 'Access denied' });
    const customer = await Customer.findOne(scope(req, { _id: req.params.id }));
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });
    await Promise.all([Activity.deleteMany({ organization: req.user.organization._id, customer: customer._id }), Attachment.deleteMany({ organization: req.user.organization._id, customer: customer._id }), customer.deleteOne()]);
    await logAudit(req, { action: 'delete', entityType: 'customer', entityId: customer._id, entityName: customer.name, message: `Lead "${customer.name}" deleted.` });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// POST /api/customers/views — Save customer/client view
router.post('/views', async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const name = String(req.body.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ ok: false, error: 'View name is required.' });
    const entity = req.body.entity === 'client' ? 'client' : 'customer';
    const filters = req.body.filters || {};
    const columns = Array.isArray(req.body.columns) ? req.body.columns : [];

    const savedView = await SavedView.findOneAndUpdate(
      { organization: req.user.organization._id, user: req.user._id, entity, name },
      { filters, columns, sortBy: req.body.sortBy || 'recent' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ ok: true, data: savedView });
  } catch (error) { next(error); }
});

// DELETE /api/customers/views/:id — Delete customer/client saved view
router.delete('/views/:id', async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    await SavedView.deleteOne({ _id: req.params.id, organization: req.user.organization._id, user: req.user._id });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
