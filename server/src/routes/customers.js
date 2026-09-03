const express = require('express');
const mongoose = require('mongoose');

const Activity = require('../models/Activity');
const { clientTimeline: buildClientTimeline } = require('../utils/clientTimeline');
const Attachment = require('../models/Attachment');
const CrmLabel = require('../models/CrmLabel');
const { potentialFilter, isPotentialLabel } = require('../utils/leadPotential');
const CrmStage = require('../models/CrmStage');
const CustomField = require('../models/CustomField');
const Customer = require('../models/Customer');
const ClientCompany = require('../models/ClientCompany');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Notification = require('../models/Notification');
const SavedView = require('../models/SavedView');
const SyncLog = require('../models/SyncLog');
const AuditLog = require('../models/AuditLog');
const CustomRecord = require('../models/CustomRecord');
const WorkType = require('../models/WorkType');
const { parseCsv, rowsToObjects, suggestCustomerHeader, normalizeCustomerCsv, toCsv } = require('../utils/csv');
const { slugify } = require('../utils/slug');
const { logAudit } = require('../utils/audit');
const { requirePermission } = require('../middleware/auth');
const { canAccessLeadField, hasPermission, hasWorkPermission, isRestrictedUser } = require('../config/roles');
const { runLeadAutomation } = require('../services/automation');
const { getWonStageIds } = require('../services/crmStages');

const router = express.Router();

const baseCsvHeaders = ['name', 'company', 'email', 'phone', 'source', 'value', 'priority', 'leadScore', 'stage', 'labels', 'notes', 'clientCompany', 'campaign', 'nextFollowUpAt', 'followUpComment'];

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function normalizeHeader(header) {
  return slugify(String(header || '').replace(/^custom[_\s-]+/i, ''));
}

function labelFromHeader(header) {
  return String(header || '')
    .replace(/^custom[_\s-]+/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function isImportHistoryHeader(header) {
  const key = normalizeHeader(header);
  return key === 'time' || key === 'next_follow_up_date_and_time' || /^\d+_[a-z]+_follow_up$/.test(key) || /^\d+(st|nd|rd|th)_whatsapp_msg$/.test(key);
}

function foldImportHistory(row) {
  const history = Object.entries(row).filter(([header, value]) => isImportHistoryHeader(header) && String(value || '').trim());
  history.forEach(([header]) => delete row[header]);
  if (history.length) row.notes = [row.notes, ...history.map(([header, value]) => `${labelFromHeader(header)}: ${value}`)].filter(Boolean).join('\n');
  return row;
}

function inferFieldType(values) {
  const filled = values.map(value => String(value || '').trim()).filter(Boolean);
  if (!filled.length) return 'text';
  if (filled.every(value => ['true', 'false', 'yes', 'no', '1', '0', 'on', 'off'].includes(value.toLowerCase()))) return 'checkbox';
  if (filled.every(value => !Number.isNaN(Number(value)))) return 'number';
  if (filled.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))) return 'date';
  return 'text';
}

function normalizePhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.length >= 10 ? clean.slice(-10) : clean;
}

function courseFromFileName(fileName) {
  return String(fileName || '')
    .replace(/\.(csv|xlsx?|xls)$/i, '')
    .replace(/^academy\s+leads?\s*[-–—]+\s*/i, '')
    .replace(/(?:\s*\(\d+\))+\s*$/g, '')
    .trim();
}

function cleanImportedPhone(phone) {
  return String(phone || '').replace(/^\s*p\s*:\s*/i, '').trim();
}

async function ensureFieldsFromCsvHeaders(organization, clientCompany, headers, rows) {
  const existingFields = await CustomField.find({ organization, clientCompany, entity: 'customer' });
  const existingKeys = new Set(existingFields.map(field => field.key));
  const reservedKeys = new Set(baseCsvHeaders.map(normalizeHeader));
  const createdFields = [];
  let nextOrder = existingFields.reduce((max, field) => Math.max(max, field.order || 0), 0) + 10;

  for (const header of headers) {
    if (isImportHistoryHeader(header)) continue;
    const key = normalizeHeader(header);
    if (!key || reservedKeys.has(key) || existingKeys.has(key)) continue;

    const values = rows.map(row => row[header]);
    const type = inferFieldType(values);
    const field = await CustomField.create({
      organization,
      clientCompany,
      entity: 'customer',
      label: labelFromHeader(header) || key,
      key,
      type,
      options: [],
      required: false,
      order: nextOrder,
      isActive: true
    });

    existingKeys.add(key);
    createdFields.push(field);
    nextOrder += 10;
  }

  const fields = await CustomField.find({ organization, clientCompany, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 });
  return { fields, createdCount: createdFields.length };
}

async function buildCustomerImportPreview(organization, csvText, activeCompany, options = {}) {
  const {
    mappings = new Map(),
    duplicateRule = 'update',
    defaultStageId = null,
    defaultAssignedToId = null,
    defaultClientCompanyId = null,
    defaultCourse = ''
  } = options;

  const parsedRows = parseCsv(csvText);
  const columnMappings = (parsedRows[0] || []).map(header => ({
    header,
    target: mappings.get(header) || suggestCustomerHeader(header)
  }));
  const csvRows = normalizeCustomerCsv(parsedRows, mappings);
  const headers = csvRows[0] || [];
  const objects = rowsToObjects(csvRows).map(foldImportHistory);

  if (activeCompany) {
    objects.forEach(row => {
      row.clientCompany = activeCompany.name;
      if (!row.campaign && defaultCourse) row.campaign = defaultCourse;
    });
  }

  const [stages, labels, companies, campaigns, customers, fields] = await Promise.all([
    CrmStage.find({ organization, clientCompany: activeCompany._id, isActive: true }).sort({ order: 1, createdAt: 1 }),
    CrmLabel.find({ organization, clientCompany: activeCompany._id, isActive: true }),
    ClientCompany.find({ organization }),
    Campaign.find({ organization }),
    Customer.find({ organization, ...(activeCompany ? { clientCompany: activeCompany._id } : {}) }).select('name email phone'),
    CustomField.find({ organization, clientCompany: activeCompany._id, entity: 'customer', isActive: true })
  ]);

  const stageByName = new Map(stages.map(stage => [stage.name.toLowerCase(), stage]));
  const labelByName = new Map(labels.map(label => [label.name.toLowerCase(), label]));
  const companyByName = new Map(companies.map(company => [company.name.toLowerCase(), company]));
  const campaignByKey = new Map(campaigns.map(campaign => [`${campaign.clientCompany}_${campaign.name.toLowerCase()}`, campaign]));
  const customerByEmail = new Map(customers.filter(customer => customer.email).map(customer => [customer.email.toLowerCase(), customer]));
  const customerByPhone = new Map();
  customers.forEach(customer => {
    const phone = normalizePhone(customer.phone);
    if (phone) customerByPhone.set(phone, customer);
  });

  const existingFieldKeys = new Set(fields.map(field => field.key));
  const reservedKeys = new Set(baseCsvHeaders.map(normalizeHeader));
  const fieldsToCreate = headers
    .map(header => ({ header, key: normalizeHeader(header), label: labelFromHeader(header) }))
    .filter(field => field.key && !isImportHistoryHeader(field.header) && !reservedKeys.has(field.key) && !existingFieldKeys.has(field.key));

  const defaultStage = stages.find(s => String(s._id) === String(defaultStageId)) || stages.find(s => s.isDefault) || stages[0];

  const rows = objects.map((row, index) => {
    const rowNumber = index + 2;
    const messages = [];
    const warnings = [];
    let status = 'create';

    const hasIdentity = Boolean(String(row.name || row.phone || row.email || '').trim());
    if (!hasIdentity) {
      status = 'skip';
      messages.push('Missing name, email, and phone.');
    }

    if (row.leadScore && !Number.isFinite(Number(row.leadScore))) warnings.push(`Lead score "${row.leadScore}" is not numeric and will use 0.`);
    if ((row.nextFollowUpAt || options.defaultNextFollowUpAt) && !importedFollowUp(row.nextFollowUpAt || options.defaultNextFollowUpAt)) warnings.push('Follow-up date is invalid and will be left empty.');

    const stageName = String(row.stage || '').trim();
    if (!stages.length) {
      status = 'skip';
      messages.push('No active CRM stage exists.');
    } else if (stageName && !stageByName.has(stageName.toLowerCase())) {
      if (defaultStage) {
        warnings.push(`Unknown stage "${stageName}" fell back to default stage "${defaultStage.name}".`);
      } else {
        status = 'skip';
        messages.push(`Unknown pipeline stage "${stageName}". Map or create it before importing.`);
      }
    }

    const labelNames = String(row.labels || '')
      .split('|')
      .map(label => label.trim())
      .filter(Boolean);
    const missingLabels = labelNames.filter(label => !labelByName.has(label.toLowerCase()));
    if (missingLabels.length) {
      warnings.push(`New labels will be created: ${missingLabels.join(', ')}.`);
    }

    const companyName = String(row.clientCompany || '').trim();
    let company = companyName ? companyByName.get(companyName.toLowerCase()) : null;
    if (companyName && !company) {
      warnings.push(`Client company "${companyName}" will be created.`);
      company = { _id: `new:${companyName}` };
    }

    const campaignName = String(row.campaign || '').trim();
    if (campaignName) {
      if (!companyName && !defaultClientCompanyId) {
        warnings.push(`Campaign "${campaignName}" needs a clientCompany value and will be skipped.`);
      } else if (company && !String(company._id).startsWith('new:')) {
        const campaignKey = `${company._id}_${campaignName.toLowerCase()}`;
        if (!campaignByKey.has(campaignKey)) warnings.push(`Campaign "${campaignName}" will be created.`);
      } else {
        warnings.push(`Campaign "${campaignName}" will be created after the new company is created.`);
      }
    }

    const email = String(row.email || '').trim().toLowerCase();
    const phone = normalizePhone(row.phone);

    let existingCustomer = null;
    if (duplicateRule === 'update' || duplicateRule === 'skip') {
      existingCustomer = (email && customerByEmail.get(email)) || (phone && customerByPhone.get(phone));
    }

    if (status !== 'skip' && existingCustomer) {
      status = duplicateRule === 'skip' ? 'skip' : 'update';
      if (duplicateRule === 'skip') {
        messages.push('Duplicate lead skipped based on email/phone matching rules.');
      }
    }

    return {
      rowNumber,
      status,
      name: row.name || row.company || row.phone || row.email || 'Unnamed row',
      email: row.email || '',
      phone: row.phone || '',
      stage: stageName || (defaultStage ? defaultStage.name : ''),
      campaign: row.campaign || '',
      value: row.value || '0',
      messages,
      warnings
    };
  });

  return {
    headers,
    totalRows: objects.length,
    createCount: rows.filter(row => row.status === 'create').length,
    updateCount: rows.filter(row => row.status === 'update').length,
    skipCount: rows.filter(row => row.status === 'skip').length,
    warningCount: rows.reduce((total, row) => total + row.warnings.length, 0),
    fieldsToCreate,
    columnMappings,
    rows
  };
}

function isManagerOrAdmin(user) {
  return user && ['admin', 'manager'].includes(user.role);
}

function canAccessCustomer(user, customer, activeCompany) {
  if (activeCompany && String(customer.clientCompany?._id || customer.clientCompany || '') !== String(activeCompany._id)) return false;
  if (!hasPermission(user, 'businesses.view')) return false;
  return !isRestrictedUser(user) || Boolean(customer.assignedTo && String(customer.assignedTo._id || customer.assignedTo) === String(user._id));
}

function getScopedCustomerFilter(req, extra = {}) {
  const filter = { organization: req.user.organization._id, ...extra };
  if (req.activeCompany) filter.clientCompany = req.activeCompany._id;
  if (isRestrictedUser(req.user)) {
    filter.assignedTo = req.user._id;
  }
  return filter;
}

function pickSelectedIds(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(id => String(id || '').trim()).filter(Boolean);
}

function cleanSavedViewFilters(body) {
  const allowed = ['q', 'stage', 'label', 'campaign', 'sortBy', 'view', 'dateFrom', 'dateTo'];
  return allowed.reduce((filters, key) => {
    if (body[key] !== undefined && String(body[key]).trim() !== '') filters[key] = String(body[key]).trim();
    return filters;
  }, {});
}

function buildSavedViewUrl(view) {
  const params = new URLSearchParams(view.filters || {});
  params.set('viewId', String(view._id));
  return `/customers?${params.toString()}`;
}

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
    notes: String(body.notes || '').trim()
  };
}

async function loadFormOptions(user, activeCompany) {
  const organization = user.organization._id;
  const companyFilter = { organization, status: 'active' };
  if (!['admin', 'manager'].includes(user.role)) companyFilter.assignedUsers = user._id;

  const [stages, labels, fields, companies, users] = await Promise.all([
    CrmStage.find({ organization, clientCompany: activeCompany._id, isActive: true }).sort({ order: 1, createdAt: 1 }),
    CrmLabel.find({ organization, clientCompany: activeCompany._id, isActive: true }).sort({ name: 1 }),
    CustomField.find({ organization, clientCompany: activeCompany._id, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
    ClientCompany.find(companyFilter).sort({ name: 1 }),
    User.find({ organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }).sort({ name: 1 })
  ]);

  const campaignFilter = { organization, status: 'active' };
  if (!['admin', 'manager'].includes(user.role)) campaignFilter.clientCompany = { $in: companies.map(company => company._id) };
  const campaigns = await Campaign.find(campaignFilter).sort({ name: 1 });

  return { stages, labels, fields, companies, campaigns, users };
}

async function validateLeadRelations(req, body) {
  const organization = req.user.organization._id;
  const clientCompanyId = req.activeCompany?._id || null;
  const campaignId = body.campaign || null;

  if (body.stage && !await CrmStage.exists({ _id: body.stage, organization, clientCompany: clientCompanyId, isActive: true })) {
    return { ok: false, message: 'Selected stage does not belong to the active CRM.' };
  }

  if (clientCompanyId) {
    const companyFilter = { _id: clientCompanyId, organization, status: 'active' };
    if (!['admin', 'manager'].includes(req.user.role)) companyFilter.assignedUsers = req.user._id;
    const company = await ClientCompany.findOne(companyFilter);
    if (!company) return { ok: false, message: 'You cannot assign this lead to that client company.' };
  }

  if (campaignId) {
    const campaign = await Campaign.findOne({ _id: campaignId, organization, status: 'active' });
    if (!campaign) return { ok: false, message: 'Selected campaign is not available.' };
    if (clientCompanyId && String(campaign.clientCompany) !== String(clientCompanyId)) {
      return { ok: false, message: 'Selected campaign does not belong to the selected client company.' };
    }
    if (isRestrictedUser(req.user)) {
      const company = await ClientCompany.findOne({
        _id: campaign.clientCompany,
        organization,
        assignedUsers: req.user._id
      });
      if (!company) return { ok: false, message: 'You cannot assign this lead to that campaign.' };
    }
  }

  return { ok: true };
}

function addDuplicate(groups, key, reason, customer) {
  if (!key) return;
  if (!groups.has(key)) groups.set(key, { key, reason, customers: [] });
  groups.get(key).customers.push(customer);
}

function getCustomValue(mapLike, key) {
  if (!mapLike) return undefined;
  if (typeof mapLike.get === 'function') return mapLike.get(key);
  return mapLike[key];
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

  const primaryLabels = new Set((primary.labels || []).map(label => String(label)));
  (duplicate.labels || []).forEach(label => {
    if (!primaryLabels.has(String(label))) primary.labels.push(label);
  });

  const mergedCustomData = {};
  if (primary.customData) {
    for (const [key, value] of primary.customData.entries()) mergedCustomData[key] = value;
  }
  if (duplicate.customData) {
    for (const [key, value] of duplicate.customData.entries()) {
      if (getCustomValue(mergedCustomData, key) === undefined || getCustomValue(mergedCustomData, key) === '') {
        mergedCustomData[key] = value;
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
    note: `Merged duplicate lead "${duplicate.name}" into this profile.`
  });
}

function pickCustomData(body, fields) {
  const customData = {};
  fields.forEach(field => {
    const inputName = `custom_${field.key}`;
    if (field.type === 'checkbox') {
      customData[field.key] = body[inputName] === 'on';
    } else if (field.type === 'number') {
      customData[field.key] = body[inputName] === '' ? null : Number(body[inputName]);
    } else {
      customData[field.key] = body[inputName] || '';
    }
  });
  return customData;
}

function permittedLeadFields(user, fields, action = 'view') {
  return fields.filter(field => canAccessLeadField(user, field.key, action));
}

function mergePermittedCustomData(customer, body, fields, user) {
  const updated = customer.customData?.toObject?.() || Object.fromEntries(customer.customData || []);
  Object.assign(updated, pickCustomData(body, permittedLeadFields(user, fields, 'edit')));
  return updated;
}

router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { q, stage, label, campaign, sortBy = 'recent', view = 'all', dateFrom = '', dateTo = '', error = '', success = '', viewId = '', page: pageParam = '1' } = req.query;
    const selectedStageId = stage || '';
    const [potentialLabels, potentialStages] = await Promise.all([
      CrmLabel.find({ organization, clientCompany: req.activeCompany._id, isActive: true }),
      CrmStage.find({ organization, clientCompany: req.activeCompany._id, isActive: true })
    ]);
    const highPotentialFilter = potentialFilter(potentialLabels, potentialStages);
    const designatedLabels = potentialLabels.filter(isPotentialLabel);
    const potentialTitle = designatedLabels.length === 1 ? designatedLabels[0].name : 'HP (High Potential)';
    const filter = { organization, clientCompany: req.activeCompany._id };

    const wonStageIds = await getWonStageIds(organization, req.activeCompany._id);

    if (stage) {
      filter.stage = stage;
    } else {
      filter.stage = { $nin: wonStageIds };
    }
    if (label) filter.labels = label;
    if (campaign) filter.campaign = campaign;
    const createdAt = {};
    if (dateFrom) {
      const start = new Date(dateFrom);
      if (!Number.isNaN(start.getTime())) createdAt.$gte = start;
    }
    if (dateTo) {
      const end = new Date(dateTo);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        createdAt.$lte = end;
      }
    }
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;

    const companyFilter = { organization, status: 'active' };
    if (isRestrictedUser(req.user)) {
      companyFilter.assignedUsers = req.user._id;
      filter.assignedTo = req.user._id;
    }

    // Quick View tabs
    if (view === 'recent') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      filter.updatedAt = { $gte: sevenDaysAgo };
    } else if (view === 'high-value') {
      filter.value = { $gte: 50000 };
    } else if (view === 'new') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      filter.createdAt = { $gte: sevenDaysAgo };
    } else if (view === 'potential' || view === 'hot') {
      Object.assign(filter, highPotentialFilter);
    } else if (view === 'assigned') {
      filter.assignedTo = req.user._id;
    } else if (view === 'qualified') {
      const qualifiedStages = await CrmStage.find({ organization, clientCompany: req.activeCompany._id, name: /qualified/i });
      filter.stage = { $in: qualifiedStages.map(s => s._id) };
    } else if (view === 'overdue') {
      filter.nextFollowUpAt = { $lt: new Date() };
    } else if (view === 'followup' || view === 'due') {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      filter.nextFollowUpAt = { $exists: true, $ne: null, $lte: endOfToday };
    } else if (view === 'cold') {
      const coldStages = await CrmStage.find({ organization, clientCompany: req.activeCompany._id, name: /cold/i });
      const coldLabels = await CrmLabel.find({ organization, clientCompany: req.activeCompany._id, name: /cold/i });
      filter.$or = [
        { stage: { $in: coldStages.map(s => s._id) } },
        { labels: { $in: coldLabels.map(l => l._id) } }
      ];
    }

    if (q) {
      const safeQ = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const searchOr = [
        { name: { $regex: safeQ, $options: 'i' } },
        { company: { $regex: safeQ, $options: 'i' } },
        { email: { $regex: safeQ, $options: 'i' } },
        { phone: { $regex: safeQ, $options: 'i' } }
      ];
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { $or: searchOr }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }
    // Dynamic sorting
    let sortObj = { updatedAt: -1 }; // Default: Recently Updated first
    if (sortBy === 'old') {
      sortObj = { updatedAt: 1 };
    } else if (sortBy === 'highest-value') {
      sortObj = { value: -1 };
    } else if (sortBy === 'lowest-value') {
      sortObj = { value: 1 };
    } else if (sortBy === 'name') {
      sortObj = { name: 1 };
    }

    const campaignFilterQuery = { organization, clientCompany: req.activeCompany._id, status: 'active' };
    const pageSize = Number.parseInt(req.query.pageSize, 10) || 10;
    const totalResults = await Customer.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
    const page = Math.min(Math.max(1, Number.parseInt(pageParam, 10) || 1), totalPages);

    const [customers, allStages, labels, fields, companies, campaigns, users, savedViews] = await Promise.all([
      Customer.find(filter).populate('stage labels assignedTo clientCompany campaign').sort(sortObj).skip((page - 1) * pageSize).limit(pageSize),
      CrmStage.find({ organization, clientCompany: req.activeCompany._id }).sort({ order: 1 }),
      CrmLabel.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ name: 1 }),
      CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
      ClientCompany.find(companyFilter).sort({ name: 1 }),
      Campaign.find(campaignFilterQuery).sort({ name: 1 }),
      User.find({ organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }).sort({ name: 1 }),
      SavedView.find({ organization, user: req.user._id, entity: 'customer' }).sort({ updatedAt: -1 })
    ]);
    const customerStageIds = new Set(customers.filter(customer => customer.stage).map(customer => String(customer.stage._id)));
    const stages = allStages.filter(stage => stage.isActive || customerStageIds.has(String(stage._id)) || String(stage._id) === String(selectedStageId));
    const activeSavedView = savedViews.find(savedView => String(savedView._id) === String(viewId)) || null;
    const statsFilter = { organization, clientCompany: req.activeCompany._id, stage: { $nin: wonStageIds } };
    if (isRestrictedUser(req.user)) statsFilter.assignedTo = req.user._id;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const qualifiedStageIds = allStages.filter(item => !item.isWon && /qualified/i.test(item.name)).map(item => item._id);
    const [totalLeads, newLeads, qualifiedLeads, hotLeads, overdueLeads] = await Promise.all([
      Customer.countDocuments(statsFilter),
      Customer.countDocuments({ ...statsFilter, createdAt: { $gte: sevenDaysAgo } }),
      qualifiedStageIds.length ? Customer.countDocuments({ ...statsFilter, stage: { $in: qualifiedStageIds } }) : 0,
      Customer.countDocuments({ ...statsFilter, ...highPotentialFilter }),
      Customer.countDocuments({ ...statsFilter, nextFollowUpAt: { $lt: new Date() } })
    ]);

    res.render('customers/index', {
      title: 'Customers',
      pageTitle: 'Leads',
      isClientView: false,
      customers,
      stages,
      labels,
      fields: permittedLeadFields(req.user, fields),
      companies,
      campaigns,
      users,
      savedViews,
      activeSavedView,
      pagination: { page, pageSize, totalPages, totalResults },
      leadStats: { totalLeads, newLeads, qualifiedLeads, hotLeads, overdueLeads },
      potentialTitle,
      filters: { 
        q: q || '', 
        stage: stage || '', 
        label: label || '', 
        campaign: campaign || '',
        dateFrom,
        dateTo,
        sortBy,
        view,
        viewId,
        error,
        success
      },
      importResult: {
        imported: req.query.imported || '',
        updated: req.query.updated || '',
        skipped: req.query.skipped || '',
        fieldsCreated: req.query.fieldsCreated || ''
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/views', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.redirect('/customers?error=Saved view name is required.');
    }

    let columns = [];
    if (req.body.columnsJson) {
      try {
        const parsedColumns = JSON.parse(req.body.columnsJson);
        if (Array.isArray(parsedColumns)) columns = parsedColumns;
      } catch (error) {
        columns = [];
      }
    }

    const savedView = await SavedView.findOneAndUpdate(
      {
        organization: req.user.organization._id,
        user: req.user._id,
        entity: 'customer',
        name
      },
      {
        $set: {
          filters: cleanSavedViewFilters(req.body),
          columns
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await logAudit(req, {
      action: 'saved_view_save',
      entityType: 'customer',
      entityId: savedView._id,
      entityName: savedView.name,
      message: `Saved lead view "${savedView.name}".`
    });

    res.redirect(buildSavedViewUrl(savedView));
  } catch (error) {
    next(error);
  }
});

router.post('/views/:id/delete', async (req, res, next) => {
  try {
    const savedView = await SavedView.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization._id,
      user: req.user._id,
      entity: 'customer'
    });

    if (savedView) {
      await logAudit(req, {
        action: 'saved_view_delete',
        entityType: 'customer',
        entityId: savedView._id,
        entityName: savedView.name,
        message: `Deleted lead view "${savedView.name}".`
      });
    }

    res.redirect('/customers?success=Saved view deleted.');
  } catch (error) {
    next(error);
  }
});

router.post('/bulk', (req, res, next) => requirePermission(`businesses.${req.body.action === 'delete' ? 'delete' : 'update'}`)(req, res, next), async (req, res, next) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const organization = req.user.organization._id;
    const ids = pickSelectedIds(req.body.selectedIds).filter(id => /^[a-f\d]{24}$/i.test(id));
    const action = String(req.body.action || '').trim();

    if (!ids.length) {
      return res.redirect('/customers?error=Select at least one lead before running a bulk action.');
    }

    const customers = await Customer.find({ _id: { $in: ids }, organization, clientCompany: req.activeCompany._id }).populate('assignedTo stage');
    if (!customers.length) {
      return res.redirect('/customers?error=No matching leads were found for that bulk action.');
    }

    const customerIds = customers.map(customer => customer._id);
    let update = null;
    let activityNote = '';
    let success = '';
    const metadata = { action, count: customers.length };

    if (action === 'stage') {
      const stage = await CrmStage.findOne({ _id: req.body.stageId, organization, clientCompany: req.activeCompany._id, isActive: true });
      if (!stage) return res.redirect('/customers?error=Choose a valid stage for the bulk update.');
      update = { $set: { stage: stage._id } };
      activityNote = `Bulk update: stage changed to ${stage.name}.`;
      success = `${customers.length} lead(s) moved to ${stage.name}.`;
      metadata.stage = stage.name;
    } else if (action === 'transfer') {
      const assignedTo = req.body.assignedTo || null;
      let assignee = null;
      if (assignedTo) {
        assignee = await User.findOne({ _id: assignedTo, organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } });
        if (!assignee) return res.redirect('/customers?error=Choose a valid active user for transfer.');
      }
      update = { $set: { assignedTo: assignee ? assignee._id : null } };
      activityNote = `Bulk update: lead assigned to ${assignee ? assignee.name : 'Unassigned'}.`;
      success = `${customers.length} lead(s) transferred to ${assignee ? assignee.name : 'Unassigned'}.`;
      metadata.assignedTo = assignee ? assignee.name : 'Unassigned';

      if (assignee && String(assignee._id) !== String(req.user._id)) {
        await Notification.create({
          organization,
          user: assignee._id,
          title: 'Bulk Lead Transfer',
          message: `${customers.length} lead(s) were assigned to you by ${req.user.name}.`,
          link: '/customers'
        });
      }
    } else if (action === 'priority') {
      const priority = String(req.body.priority || '').toLowerCase();
      if (!['low', 'medium', 'high'].includes(priority)) return res.redirect('/customers?error=Choose a valid priority.');
      update = { $set: { priority } };
      activityNote = `Bulk update: priority set to ${priority}.`;
      success = `${customers.length} lead(s) updated to ${priority} priority.`;
      metadata.priority = priority;
    } else if (action === 'value') {
      const value = Number(req.body.value);
      if (Number.isNaN(value) || value < 0) return res.redirect('/customers?error=Enter a valid non-negative lead value.');
      update = { $set: { value } };
      activityNote = `Bulk update: lead value set to Rs. ${value.toLocaleString('en-IN')}.`;
      success = `${customers.length} lead(s) updated with the new value.`;
      metadata.value = value;
    } else if (action === 'source') {
      const source = String(req.body.source || '').trim();
      if (!source) return res.redirect('/customers?error=Enter a source before running the bulk update.');
      update = { $set: { source } };
      activityNote = `Bulk update: source set to ${source}.`;
      success = `${customers.length} lead(s) updated with source ${source}.`;
      metadata.source = source;
    } else if (action === 'delete') {
      await Promise.all([
        Activity.deleteMany({ organization, customer: { $in: customerIds } }),
        Attachment.deleteMany({ organization, customer: { $in: customerIds } }),
        Customer.deleteMany({ _id: { $in: customerIds }, organization })
      ]);
      await logAudit(req, {
        action: 'bulk_delete',
        entityType: 'customer',
        message: `Bulk deleted ${customers.length} lead(s).`,
        metadata: { count: customers.length, ids: customerIds }
      });
      return res.redirect(`/customers?success=${encodeURIComponent(`${customers.length} lead(s) deleted.`)}`);
    } else {
      return res.redirect('/customers?error=Choose a supported bulk action.');
    }

    await Customer.updateMany({ _id: { $in: customerIds }, organization, clientCompany: req.activeCompany._id }, update);
    await Activity.insertMany(customers.map(customer => ({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: action === 'stage' ? 'stage_changed' : 'note',
      note: activityNote
    })));
    await logAudit(req, {
      action: `bulk_${action}`,
      entityType: 'customer',
      message: `Bulk ${action} action applied to ${customers.length} lead(s).`,
      metadata
    });

    res.redirect(`/customers?success=${encodeURIComponent(success)}`);
  } catch (error) {
    next(error);
  }
});

router.get('/new', async (req, res, next) => {
  try {
    const { scope = '' } = req.query;
    const isClientScope = scope === 'client';
    let options = await loadFormOptions(req.user, req.activeCompany);
    if (isClientScope) {
      // Creating a client directly: offer only won stages so the record lands
      // in /clients from the moment it is saved.
      const wonStages = options.stages.filter(stage => stage.isWon);
      if (wonStages.length) options = { ...options, stages: wonStages };
    }
    res.render('customers/form', {
      title: isClientScope ? 'New client' : 'New customer',
      customer: null,
      action: '/customers',
      clientScope: isClientScope,
      ...options,
      fields: permittedLeadFields(req.user, options.fields),
      editableLeadFieldKeys: permittedLeadFields(req.user, options.fields, 'edit').map(field => field.key),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export.csv', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { dateFrom = '', dateTo = '', scope = 'leads' } = req.query;
    const dateFilter = {};
    if (dateFrom) {
      const start = new Date(dateFrom);
      if (!Number.isNaN(start.getTime())) dateFilter.$gte = start;
    }
    if (dateTo) {
      const end = new Date(dateTo);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
    }
    const extraFilter = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
    const wonStageIds = await getWonStageIds(organization, req.activeCompany._id);
    extraFilter.stage = scope === 'clients' ? { $in: wonStageIds } : { $nin: wonStageIds };
    const [customers, fields] = await Promise.all([
      Customer.find(getScopedCustomerFilter(req, extraFilter)).populate('stage labels assignedTo clientCompany campaign').sort({ updatedAt: -1 }),
      CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 })
    ]);

    const customHeaders = fields.map(field => `custom_${field.key}`);
    const headers = [...baseCsvHeaders, ...customHeaders];
    const rows = customers.map(customer => {
      const row = {
        name: customer.name,
        company: customer.company,
        email: customer.email,
        phone: customer.phone,
        source: customer.source,
        value: customer.value,
        priority: customer.priority || 'medium',
        leadScore: customer.leadScore || 0,
        stage: customer.stage ? customer.stage.name : '',
        labels: customer.labels.map(label => label.name).join('|'),
        notes: customer.notes,
        clientCompany: customer.clientCompany ? customer.clientCompany.name : '',
        campaign: customer.campaign ? customer.campaign.name : ''
      };
      fields.forEach(field => {
        row[`custom_${field.key}`] = customer.customData ? customer.customData.get(field.key) : '';
      });
      return row;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${scope === 'clients' ? 'clients' : 'leads'}.csv"`);
    res.send(toCsv(headers, rows));
  } catch (error) {
    next(error);
  }
});

router.get('/import-template.csv', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const fields = await CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 });
    const customHeaders = fields.map(field => `custom_${field.key}`);
    const headers = [...baseCsvHeaders, ...customHeaders];
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
      clientCompany: 'Vande Digital Academy',
      campaign: 'AI Bootcamp'
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
  } catch (error) {
    next(error);
  }
});

router.get('/duplicates', async (req, res, next) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const organization = req.user.organization._id;
    const customers = await Customer.find({ organization })
      .populate('stage labels assignedTo clientCompany campaign')
      .sort({ updatedAt: -1 });

    const groups = new Map();
    customers.forEach(customer => {
      addDuplicate(groups, customer.email ? `email:${customer.email.toLowerCase()}` : '', 'Same email', customer);
      addDuplicate(groups, normalizePhone(customer.phone) ? `phone:${normalizePhone(customer.phone)}` : '', 'Same phone', customer);
    });

    const duplicateGroups = Array.from(groups.values())
      .filter(group => group.customers.length > 1)
      .map(group => ({
        ...group,
        customers: group.customers.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      }))
      .sort((a, b) => b.customers.length - a.customers.length);

    res.render('customers/duplicates', {
      title: 'Duplicate Leads',
      duplicateGroups,
      success: req.query.success || '',
      error: req.query.error || ''
    });
  } catch (error) {
    next(error);
  }
});

router.get('/import', requirePermission('businesses.create'), async (req, res, next) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }
    const organization = req.user.organization._id;
    const { scope = '' } = req.query;
    const isClientScope = scope === 'client';
    let stages = await CrmStage.find({ organization, clientCompany: req.activeCompany?._id, isActive: true }).sort({ order: 1, createdAt: 1 });
    if (isClientScope) {
      // Importing clients directly: default into won stages so imported rows
      // land in /clients. Fall back to all stages when none are marked won.
      const wonStages = stages.filter(stage => stage.isWon);
      if (wonStages.length) stages = wonStages;
    }
    const [users, companies] = await Promise.all([
      User.find({ organization, isActive: { $ne: false } }).sort({ name: 1 }),
      ClientCompany.find({ organization, status: 'active' }).sort({ name: 1 })
    ]);
    res.render('customers/import', {
      title: isClientScope ? 'Import Clients Wizard' : 'Import Leads Wizard',
      stages,
      users,
      companies,
      clientScope: isClientScope,
      activeCompany: req.activeCompany
    });
  } catch (error) {
    next(error);
  }
});

router.post('/import/preview', requirePermission('businesses.create'), express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '4mb' }), async (req, res, next) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const csvText = typeof req.body === 'string' ? req.body : (req.body.csvData || '');
    const csvFileName = req.body.csvFileName || '';
    if (!csvText.trim()) {
      const referer = req.get('referer') || '';
      if (referer.includes('/customers') && !referer.includes('/customers/import')) {
        return res.redirect('/customers?error=Please select a CSV file before previewing.');
      }
      return res.redirect('/customers/import?error=Please select or paste a CSV file before previewing.');
    }

    const mappingHeaders = Array.isArray(req.body.mappingHeader) ? req.body.mappingHeader : req.body.mappingHeader ? [req.body.mappingHeader] : [];
    const mappingTargets = Array.isArray(req.body.mappingTarget) ? req.body.mappingTarget : req.body.mappingTarget ? [req.body.mappingTarget] : [];
    const standardTargets = new Set([...baseCsvHeaders, '__ignore']);
    const mappings = new Map(mappingHeaders.map((header, index) => {
      const target = mappingTargets[index] || header;
      return [header, standardTargets.has(target) || target === header ? target : header];
    }));

    const preview = await buildCustomerImportPreview(req.user.organization._id, csvText, req.activeCompany, {
      mappings,
      duplicateRule: req.body.duplicateRule || 'update',
      defaultStageId: req.body.defaultStageId,
      defaultAssignedToId: req.body.defaultAssignedToId,
      defaultClientCompanyId: req.body.defaultClientCompanyId,
      defaultCourse: courseFromFileName(csvFileName)
      ,defaultNextFollowUpAt: req.body.defaultNextFollowUpAt || ''
    });

    const [stages, users, companies] = await Promise.all([
      CrmStage.find({ organization: req.user.organization._id, clientCompany: req.activeCompany?._id, isActive: true }),
      User.find({ organization: req.user.organization._id, isActive: { $ne: false } }),
      ClientCompany.find({ organization: req.user.organization._id })
    ]);

    res.render('customers/import-preview', {
      title: 'Preview Lead Import',
      csvData: csvText,
      csvFileName,
      duplicateRule: req.body.duplicateRule || 'update',
      defaultStageId: req.body.defaultStageId,
      defaultAssignedToId: req.body.defaultAssignedToId,
      defaultClientCompanyId: req.body.defaultClientCompanyId,
      defaultNextFollowUpAt: req.body.defaultNextFollowUpAt || '',
      defaultFollowUpComment: req.body.defaultFollowUpComment || '',
      defaultStage: stages.find(s => String(s._id) === String(req.body.defaultStageId)) || stages[0],
      defaultOwner: users.find(u => String(u._id) === String(req.body.defaultAssignedToId)) || req.user,
      defaultCompany: companies.find(c => String(c._id) === String(req.body.defaultClientCompanyId)) || req.activeCompany,
      preview
    });
  } catch (error) {
    next(error);
  }
});

router.post('/duplicates/merge', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const organization = req.user.organization._id;
    const { primaryId, duplicateId } = req.body;
    if (!primaryId || !duplicateId || String(primaryId) === String(duplicateId)) {
      return res.redirect('/customers/duplicates?error=Choose two different leads to merge.');
    }

    const [primary, duplicate] = await Promise.all([
      Customer.findOne({ _id: primaryId, organization }),
      Customer.findOne({ _id: duplicateId, organization })
    ]);

    if (!primary || !duplicate) {
      return res.redirect('/customers/duplicates?error=One of the selected leads could not be found.');
    }
    const sameEmail = primary.email && duplicate.email && primary.email.toLowerCase() === duplicate.email.toLowerCase();
    const samePhone = normalizePhone(primary.phone) && normalizePhone(primary.phone) === normalizePhone(duplicate.phone);
    if (!sameEmail && !samePhone) {
      return res.redirect('/customers/duplicates?error=Selected leads do not share the same email or phone.');
    }

    await mergeDuplicateCustomer({ organization, primary, duplicate, user: req.user });
    await logAudit(req, {
      action: 'merge',
      entityType: 'customer',
      entityId: primary._id,
      entityName: primary.name,
      message: `Merged duplicate lead "${duplicate.name}" into "${primary.name}".`,
      metadata: { duplicateId }
    });
    res.redirect('/customers/duplicates?success=Duplicate lead merged successfully.');
  } catch (error) {
    next(error);
  }
});

router.post('/import', requirePermission('businesses.create'), express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '4mb' }), async (req, res, next) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const organization = req.user.organization._id;
    const csvText = typeof req.body === 'string' ? req.body : (req.body.csvData || '');
    const duplicateRule = req.body.duplicateRule || 'update';

    const mappingHeaders = Array.isArray(req.body.mappingHeader) ? req.body.mappingHeader : req.body.mappingHeader ? [req.body.mappingHeader] : [];
    const mappingTargets = Array.isArray(req.body.mappingTarget) ? req.body.mappingTarget : req.body.mappingTarget ? [req.body.mappingTarget] : [];
    const standardTargets = new Set([...baseCsvHeaders, '__ignore']);
    const mappings = new Map(mappingHeaders.map((header, index) => {
      const target = mappingTargets[index] || header;
      return [header, standardTargets.has(target) || target === header ? target : header];
    }));

    const csvRows = normalizeCustomerCsv(parseCsv(csvText), mappings);
    const headers = csvRows[0] || [];
    const objects = rowsToObjects(csvRows).map(foldImportHistory);
    const defaultCourse = courseFromFileName(req.body.csvFileName);
    objects.forEach(row => { if (!row.campaign && defaultCourse) row.campaign = defaultCourse; });

    const [stages, labels, companies, campaigns, existingCustomers] = await Promise.all([
      CrmStage.find({ organization, clientCompany: req.activeCompany?._id, isActive: true }).sort({ order: 1, createdAt: 1 }),
      CrmLabel.find({ organization, clientCompany: req.activeCompany?._id, isActive: true }),
      ClientCompany.find({ organization }),
      Campaign.find({ organization }),
      Customer.find({ organization, ...(req.activeCompany ? { clientCompany: req.activeCompany._id } : {}) }).select('name email phone phoneNormalized labels customData')
    ]);
    const { fields, createdCount } = await ensureFieldsFromCsvHeaders(organization, req.activeCompany?._id, headers, objects);

    const stageByName = new Map(stages.map(stage => [stage.name.toLowerCase(), stage]));
    const labelByName = new Map(labels.map(label => [label.name.toLowerCase(), label]));
    const companyByName = new Map(companies.map(c => [c.name.toLowerCase(), c]));
    const campaignByName = new Map(campaigns.map(c => [`${c.clientCompany}_${c.name.toLowerCase()}`, c]));
    const customerByEmail = new Map(existingCustomers.filter(customer => customer.email).map(customer => [customer.email.toLowerCase(), customer]));
    const customerByPhone = new Map();
    existingCustomers.forEach(customer => {
      const phone = customer.phoneNormalized || normalizePhone(customer.phone);
      if (phone) customerByPhone.set(phone, customer);
    });

    const defaultStage = stages.find(s => String(s._id) === String(req.body.defaultStageId)) || stages.find(stage => stage.isDefault) || stages[0];

    const warnings = [];
    const importedStageNames = [...new Set(objects.map(row => String(row.stage || '').trim()).filter(Boolean))];
    const unknownStages = importedStageNames.filter(name => !stageByName.has(name.toLowerCase()));
    if (unknownStages.length && defaultStage) {
      warnings.push(`Unknown stages fell back to "${defaultStage.name}": ${unknownStages.join(', ')}.`);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (let index = 0; index < objects.length; index++) {
      const row = objects[index];
      const rowNumber = index + 2;

      if (!row.name && !row.phone && !row.email) {
        skipped += 1;
        continue;
      }

      let stage = null;
      const stageName = String(row.stage || '').trim();
      if (stageName) {
        if (stageByName.has(stageName.toLowerCase())) {
          stage = stageByName.get(stageName.toLowerCase());
        } else {
          const maxOrder = Math.max(0, ...stages.map(s => s.order || 0));
          const isHighPotential = stageName.toLowerCase().includes('potential');
          stage = await CrmStage.create({
            organization,
            clientCompany: req.activeCompany?._id,
            name: stageName,
            key: slugify(stageName),
            color: isHighPotential ? '#d97706' : stageName.toLowerCase().includes('call') ? '#0891b2' : stageName.toLowerCase().includes('message') ? '#7c3aed' : '#64748b',
            order: maxOrder + 10,
            isActive: true
          });
          stages.push(stage);
          stageByName.set(stageName.toLowerCase(), stage);
        }
      }
      if (!stage) stage = defaultStage;

      const selectedLabels = [];
      for (const name of String(row.labels || '').split('|').map(value => value.trim()).filter(Boolean)) {
        const key = name.toLowerCase();
        let importedLabel = labelByName.get(key);
        if (!importedLabel) {
          importedLabel = await CrmLabel.findOneAndUpdate(
            { organization, clientCompany: req.activeCompany._id, name },
            { $setOnInsert: { color: '#2563eb' } },
            { upsert: true, new: true, runValidators: true }
          );
          labelByName.set(key, importedLabel);
        }
        if (!selectedLabels.some(id => String(id) === String(importedLabel._id))) selectedLabels.push(importedLabel._id);
      }

      row.phone = cleanImportedPhone(row.phone);

      let clientCompanyId = req.body.defaultClientCompanyId || req.activeCompany?._id || null;
      let campaignId = null;

      const importedCompany = req.activeCompany ? '' : String(row.clientCompany || '').trim();
      if (importedCompany) {
        let companyObj = companyByName.get(importedCompany.toLowerCase());
        if (!companyObj) {
          companyObj = await ClientCompany.create({
            organization,
            name: importedCompany,
            status: 'active'
          });
          companyByName.set(importedCompany.toLowerCase(), companyObj);
          warnings.push(`Row ${rowNumber}: Client company "${importedCompany}" was automatically created.`);
        }
        clientCompanyId = companyObj._id;
      }

      const importedCampaign = String(row.campaign || '').trim();
      if (importedCampaign && clientCompanyId) {
        const lookupKey = `${clientCompanyId}_${importedCampaign.toLowerCase()}`;
        let campaignObj = campaignByName.get(lookupKey);
        if (!campaignObj) {
          campaignObj = await Campaign.create({
            organization,
            clientCompany: clientCompanyId,
            name: importedCampaign,
            platform: ['Meta Ads', 'Google Ads', 'LinkedIn Ads', 'YouTube', 'TikTok', 'Email Marketing', 'SEO'].includes(row.source) ? row.source : 'Other',
            status: 'active'
          });
          campaignByName.set(lookupKey, campaignObj);
          warnings.push(`Row ${rowNumber}: Campaign "${importedCampaign}" was automatically created.`);
        }
        campaignId = campaignObj._id;
      }

      const customData = {};
      fields.forEach(field => {
        const matchingHeader = Object.keys(row).find(header => normalizeHeader(header) === field.key);
        const value = row[`custom_${field.key}`] || row[field.key] || (matchingHeader ? row[matchingHeader] : '');
        if (field.type === 'checkbox') customData[field.key] = ['true', 'yes', '1', 'on'].includes(String(value).toLowerCase());
        else if (field.type === 'number') customData[field.key] = value === '' ? null : Number(value);
        else customData[field.key] = value;
      });

      // Check if lead already exists in this organization by email or phone
      const email = String(row.email || '').trim().toLowerCase();
      const phone = normalizePhone(row.phone);

      let existingCustomer = null;
      if (duplicateRule === 'update' || duplicateRule === 'skip') {
        existingCustomer = (email && customerByEmail.get(email)) || (phone && customerByPhone.get(phone)) || null;
      }

      if (existingCustomer) {
        if (duplicateRule === 'skip') {
          skipped += 1;
          continue;
        }

        // Update existing lead (merge and log)
        if (row.name) existingCustomer.name = row.name;
        if (row.company) existingCustomer.company = row.company;
        if (row.source) existingCustomer.source = row.source;
        if (row.value) existingCustomer.value = safeNumber(row.value);
        if (['low', 'medium', 'high'].includes(String(row.priority || '').toLowerCase())) {
          existingCustomer.priority = String(row.priority).toLowerCase();

        }
        if (row.leadScore !== undefined && row.leadScore !== '') existingCustomer.leadScore = Math.max(0, Math.min(100, safeNumber(row.leadScore)));
        if (row.stage && stage) existingCustomer.stage = stage._id;
        
        if (selectedLabels && selectedLabels.length) {
          const existingLabels = existingCustomer.labels.map(l => String(l));
          selectedLabels.forEach(lblId => {
            if (!existingLabels.includes(String(lblId))) {
              existingCustomer.labels.push(lblId);
            }
          });
        }
        if (clientCompanyId) existingCustomer.clientCompany = clientCompanyId;
        if (campaignId) existingCustomer.campaign = campaignId;
        if (row.notes) {
          existingCustomer.notes = existingCustomer.notes
            ? `${existingCustomer.notes}\n---\nImported Note: ${row.notes}`
            : row.notes;
        }

        // Merge custom field data
        const existingCustomData = existingCustomer.customData instanceof Map ? Object.fromEntries(existingCustomer.customData) : (existingCustomer.customData || {});
        const mergedCustomData = { ...existingCustomData, ...customData };
        existingCustomer.customData = mergedCustomData;

        const nextFollowUpAt = importedFollowUp(row.nextFollowUpAt || req.body.defaultNextFollowUpAt);
        if (nextFollowUpAt) existingCustomer.nextFollowUpAt = nextFollowUpAt;
        await existingCustomer.save();
        if (nextFollowUpAt) await Activity.create({ organization, customer: existingCustomer._id, user: req.user._id, type: 'task', note: `Follow-up scheduled for ${nextFollowUpAt.toLocaleString('en-IN')}.`, nextFollowUpAt, followUpAction: 'scheduled', comment: String(row.followUpComment || req.body.defaultFollowUpComment || '').trim().slice(0, 1000) });
        if (existingCustomer.email) customerByEmail.set(existingCustomer.email.toLowerCase(), existingCustomer);
        if (existingCustomer.phoneNormalized) customerByPhone.set(existingCustomer.phoneNormalized, existingCustomer);
        updated += 1;
      } else {
        // Create new lead
        const createdCustomer = await Customer.create({
          organization,
          name: row.name || row.company || row.phone || row.email,
          company: row.company || '',
          email: row.email || '',
          phone: row.phone || '',
          source: row.source || 'CSV Import',
          value: safeNumber(row.value),
          priority: ['low', 'medium', 'high'].includes(String(row.priority || '').toLowerCase()) ? String(row.priority).toLowerCase() : 'medium',
          leadScore: Math.max(0, Math.min(100, safeNumber(row.leadScore))),
          stage: stage._id,
          labels: selectedLabels,
          assignedTo: req.body.defaultAssignedToId || req.user._id,
          clientCompany: clientCompanyId,
          campaign: campaignId,
          notes: row.notes || '',
          customData,
          nextFollowUpAt: importedFollowUp(row.nextFollowUpAt || req.body.defaultNextFollowUpAt)
        });
        if (createdCustomer.nextFollowUpAt) await Activity.create({ organization, customer: createdCustomer._id, user: req.user._id, type: 'task', note: `Follow-up scheduled for ${createdCustomer.nextFollowUpAt.toLocaleString('en-IN')}.`, nextFollowUpAt: createdCustomer.nextFollowUpAt, followUpAction: 'scheduled', comment: String(row.followUpComment || req.body.defaultFollowUpComment || '').trim().slice(0, 1000) });
        if (createdCustomer.email) customerByEmail.set(createdCustomer.email.toLowerCase(), createdCustomer);
        if (createdCustomer.phoneNormalized) customerByPhone.set(createdCustomer.phoneNormalized, createdCustomer);
        imported += 1;
      }
    }

    // Write CSV import success stats to SyncLog
    await SyncLog.create({
      organization,
      source: 'CSV Import',
      status: 'success',
      recordsProcessed: objects.length,
      recordsCreated: imported,
      recordsUpdated: updated
    });
    await logAudit(req, {
      action: 'import',
      entityType: 'customer',
      message: `CSV import completed. Created ${imported}, updated ${updated}, skipped ${skipped}.`,
      metadata: { imported, updated, skipped, fieldsCreated: createdCount, rows: objects.length }
    });

    res.render('customers/import-results', {
      title: 'Import Results',
      totalRows: objects.length,
      imported,
      updated,
      skipped,
      fieldsCreated: createdCount,
      warnings,
      activeCompany: req.activeCompany
    });
  } catch (error) {
    try {
      await SyncLog.create({
        organization: req.user.organization._id,
        source: 'CSV Import',
        status: 'failure',
        error: error.message
      });
    } catch (logErr) {
      console.error('Failed to log CSV import error:', logErr);
    }
    next(error);
  }
});

router.post('/', requirePermission('businesses.create'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const options = await loadFormOptions(req.user, req.activeCompany);
    const firstStage = options.stages.find(stage => stage.isDefault) || options.stages[0];
    if (!firstStage && !req.body.stage) {
      return res.redirect('/customers?error=Create an active CRM stage before adding leads.');
    }
    const relationCheck = await validateLeadRelations(req, req.body);
    if (!relationCheck.ok) {
      return res.status(403).render('errors/403', { title: 'Access denied', message: relationCheck.message });
    }

    const customer = await Customer.create({
      organization,
      name: req.body.name,
      company: req.body.company,
      email: req.body.email,
      phone: req.body.phone,
      source: req.body.source || 'Manual',
      value: Number(req.body.value || 0),
      priority: ['low', 'medium', 'high'].includes(req.body.priority) ? req.body.priority : 'medium',
      leadScore: Math.max(0, Math.min(100, Number(req.body.leadScore || 0))),
      stage: req.body.stage || firstStage._id,
      labels: Array.isArray(req.body.labels) ? req.body.labels : req.body.labels ? [req.body.labels] : [],
      assignedTo: isManagerOrAdmin(req.user) ? (req.body.assignedTo || req.user._id) : req.user._id,
      clientCompany: req.activeCompany._id,
      campaign: req.body.campaign || null,
      notes: req.body.notes,
      customData: pickCustomData(req.body, permittedLeadFields(req.user, options.fields, 'edit'))
    });
    await runLeadAutomation({ customer, trigger: 'lead_created' });

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'note',
      note: 'Customer created.'
    });
    await logAudit(req, {
      action: 'create',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Lead "${customer.name}" created.`
    });

    res.redirect(`/customers/${customer._id}`);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization }).populate('stage labels assignedTo clientCompany campaign');
    if (!customer) return res.status(404).render('errors/404', { title: 'Customer not found' });

    if (!canAccessCustomer(req.user, customer, req.activeCompany)) {
      return res.status(403).redirect('/customers?error=You do not have access to this lead.');
    }

    const workTypes = (await WorkType.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ order: 1 })).filter(type => hasWorkPermission(req.user, type, 'view'));
    const workScope = { organization, workspace: req.activeCompany._id, module: { $in: workTypes.map(type => type._id) }, ...(isRestrictedUser(req.user) ? { $or: [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }] } : {}) };
    const [stages, labels, fields, activities, users, attachments, linkedWorkItems] = await Promise.all([
      CrmStage.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ order: 1 }),
      CrmLabel.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ name: 1 }),
      CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer', isActive: true }).sort({ order: 1 }),
      Activity.find({ organization, customer: req.params.id }).populate('user').sort({ createdAt: -1 }),
      User.find({ organization, isActive: { $ne: false } }).sort({ name: 1 }),
      Attachment.find({ organization, customer: customer._id }).select('-data').populate('uploadedBy').sort({ createdAt: -1 }),
      CustomRecord.find({ ...workScope, customer: customer._id }).populate('module assignedTo collaborators secondaryAssignee parentRecord').sort({ createdAt: -1 })
    ]);
    const workById = new Map(linkedWorkItems.map(item => [String(item._id), item]));
    const workHistory = await AuditLog.find({ organization, entityType: { $in: workTypes.map(type => type.key) }, $or: [{ entityId: { $in: linkedWorkItems.map(item => item._id) } }, { action: 'work_delete', 'metadata.customer': String(customer._id), 'metadata.workspace': String(req.activeCompany._id), ...(isRestrictedUser(req.user) ? { 'metadata.participants': String(req.user._id) } : {}) }], action: { $in: ['work_create', 'work_update', 'work_status', 'work_delete', 'work_subtask_create'] } })
      .populate('user')
      .sort({ createdAt: -1 })
      .limit(100);
    const relatedWorkHistory = workHistory.map(log => {
      const item = workById.get(String(log.entityId));
      const module = item?.module || workTypes.find(type => type.key === log.entityType);
      const statusLabel = key => module?.statuses?.find(status => status.key === key)?.label || key;
      const message = log.action === 'work_status'
        ? `${log.user?.name || 'System'} changed status from ${statusLabel(log.metadata?.previousStatus)} to ${statusLabel(log.metadata?.status)}.`
        : log.message;
      return { ...log.toObject(), itemTitle: item?.title || log.entityName, moduleName: module?.name || 'Work', moduleKey: module?.key || '', href: item ? `/work/${module.key}/${item._id}` : '', message };
    });
    const clientTimeline = buildClientTimeline(activities, relatedWorkHistory, attachments, customer._id);

    const referencedRecordIds = [];
    linkedWorkItems.forEach(item => {
      if (item.customFields) {
        for (const [key, val] of item.customFields.entries()) {
          if (mongoose.isObjectIdOrHexString(val)) referencedRecordIds.push(val);
        }
      }
    });
    if (customer.customData) {
      for (const [key, val] of customer.customData.entries()) {
        if (mongoose.isObjectIdOrHexString(val)) referencedRecordIds.push(val);
      }
    }
    const referencedRecords = referencedRecordIds.length ? await CustomRecord.find({ ...workScope, _id: { $in: referencedRecordIds } }).populate('module').select('title module') : [];
    const recordNames = Object.fromEntries(referencedRecords.map(r => [String(r._id), { title: r.title, moduleKey: r.module?.key || '' }]));

    res.render('customers/detail', {
      title: customer.name,
      customer,
      stages,
      labels,
      fields: permittedLeadFields(req.user, fields),
      activities,
      users,
      attachments,
      workTypes,
      linkedWorkItems,
      relatedWorkHistory,
      clientTimeline,
      recordNames,
      isClientProfile: Boolean(customer.stage?.isWon),
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization }).populate('clientCompany assignedTo');
    if (!customer) return res.status(404).render('errors/404', { title: 'Customer not found' });

    if (!canAccessCustomer(req.user, customer, req.activeCompany)) {
      return res.status(403).redirect('/customers?error=You do not have access to this lead.');
    }

    const options = await loadFormOptions(req.user, req.activeCompany);

    res.render('customers/form', {
      title: `Edit ${customer.name}`,
      customer,
      clientScope: options.stages.some(stage => String(stage._id) === String(customer.stage) && stage.isWon),
      action: `/customers/${customer._id}?_method=PUT`,
      ...options,
      fields: permittedLeadFields(req.user, options.fields),
      editableLeadFieldKeys: permittedLeadFields(req.user, options.fields, 'edit').map(field => field.key),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization });
    
    if (!customer) return res.status(404).render('errors/404', { title: 'Customer not found' });

    if (!canAccessCustomer(req.user, customer, req.activeCompany)) {
      return res.status(403).redirect('/customers?error=You do not have access to this lead.');
    }

    const options = await loadFormOptions(req.user, req.activeCompany);
    const relationCheck = await validateLeadRelations(req, req.body);
    if (!relationCheck.ok) {
      return res.status(403).render('errors/403', { title: 'Access denied', message: relationCheck.message });
    }

    const previousStageId = customer.stage;
    const previousOwnerId = customer.assignedTo;
    customer.set({
      name: req.body.name,
      company: req.body.company,
      email: req.body.email,
      phone: req.body.phone,
      source: req.body.source || 'Manual',
      value: Number(req.body.value || 0),
      priority: ['low', 'medium', 'high'].includes(req.body.priority) ? req.body.priority : 'medium',
      leadScore: Math.max(0, Math.min(100, Number(req.body.leadScore || 0))),
      stage: req.body.stage,
      labels: Array.isArray(req.body.labels) ? req.body.labels : req.body.labels ? [req.body.labels] : [],
      clientCompany: req.activeCompany._id,
      campaign: req.body.campaign || null,
      notes: req.body.notes,
      customData: mergePermittedCustomData(customer, req.body, options.fields, req.user)
    });
    if (isManagerOrAdmin(req.user)) {
      customer.assignedTo = req.body.assignedTo || null;
    }

    await customer.save();
    if (String(previousStageId || '') !== String(customer.stage || '')) await runLeadAutomation({ customer, trigger: 'stage_changed', previousStage: previousStageId });
    if (String(previousOwnerId || '') !== String(customer.assignedTo || '')) await runLeadAutomation({ customer, trigger: 'owner_changed' });
    await logAudit(req, {
      action: 'update',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Lead "${customer.name}" updated.`
    });
    res.redirect(`/customers/${customer._id}`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/stage', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization, clientCompany: req.activeCompany._id }).populate('stage');
    const stage = await CrmStage.findOne({ _id: req.body.stage, organization, clientCompany: req.activeCompany._id, isActive: true });

    if (!customer || !stage) return res.status(404).render('errors/404', { title: 'Record not found' });
    if (!canAccessCustomer(req.user, customer, req.activeCompany)) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(403).json({ ok: false, message: 'You do not have access to this lead.' });
      }
      return res.status(403).redirect('/customers?error=You do not have access to this lead.');
    }
    if (customer.stage?.isWon && !stage.isWon) {
      const message = 'Clients can only move between client statuses.';
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) return res.status(422).json({ ok: false, message });
      return res.redirect(`/clients/${customer._id}?error=${encodeURIComponent(message)}`);
    }

    const previousStage = customer.stage ? customer.stage.name : 'None';
    const previousStageId = customer.stage?._id || customer.stage;
    customer.stage = stage._id;
    await customer.save();
    await runLeadAutomation({ customer, trigger: 'stage_changed', previousStage: previousStageId });

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'stage_changed',
      note: `Stage changed from ${previousStage} to ${stage.name}.`
    });
    await logAudit(req, {
      action: 'stage_change',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Stage changed from ${previousStage} to ${stage.name}.`
    });

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.json({ ok: true, stage: stage.name, color: stage.color });
    }
    res.redirect(`/customers/${customer._id}`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/attachments', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization });
    if (!customer) return res.status(404).render('errors/404', { title: 'Customer not found' });
    if (!canAccessCustomer(req.user, customer, req.activeCompany)) {
      return res.status(403).redirect('/customers?error=You do not have access to this lead.');
    }

    const payload = parseAttachmentPayload(req.body);
    if (!payload.ok) {
      return res.redirect(`/customers/${customer._id}?error=${encodeURIComponent(payload.message)}`);
    }

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
      data: payload.buffer
    });

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'note',
      note: `Attachment uploaded: ${attachment.originalName}.`
    });
    await logAudit(req, {
      action: 'attachment_upload',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Attachment "${attachment.originalName}" uploaded to lead "${customer.name}".`,
      metadata: { attachmentId: attachment._id, category: attachment.category, size: attachment.size }
    });

    res.redirect(`/customers/${customer._id}?success=Attachment uploaded.`);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization });
    if (!customer) return res.status(404).render('errors/404', { title: 'Customer not found' });
    if (!canAccessCustomer(req.user, customer, req.activeCompany)) {
      return res.status(403).redirect('/customers?error=You do not have access to this lead.');
    }

    const attachment = await Attachment.findOne({ _id: req.params.attachmentId, organization, customer: customer._id });
    if (!attachment) return res.status(404).render('errors/404', { title: 'Attachment not found' });

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', attachment.size || attachment.data.length);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName.replace(/"/g, '')}"`);
    res.send(attachment.data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/attachments/:attachmentId/delete', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization });
    if (!customer) return res.status(404).render('errors/404', { title: 'Customer not found' });
    if (!canAccessCustomer(req.user, customer, req.activeCompany)) {
      return res.status(403).redirect('/customers?error=You do not have access to this lead.');
    }

    const attachment = await Attachment.findOne({ _id: req.params.attachmentId, organization, customer: customer._id });
    if (!attachment) return res.status(404).render('errors/404', { title: 'Attachment not found' });
    const canDelete = isManagerOrAdmin(req.user) || String(attachment.uploadedBy || '') === String(req.user._id);
    if (!canDelete) return res.status(403).render('errors/403', { title: 'Access denied' });

    await Attachment.deleteOne({ _id: attachment._id, organization });
    await logAudit(req, {
      action: 'attachment_delete',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Attachment "${attachment.originalName}" deleted from lead "${customer.name}".`,
      metadata: { attachmentId: attachment._id }
    });

    res.redirect(`/customers/${customer._id}?success=Attachment deleted.`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/activity', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization });
    if (!customer) return res.status(404).render('errors/404', { title: 'Customer not found' });
    if (!canAccessCustomer(req.user, customer, req.activeCompany)) {
      return res.status(403).redirect('/customers?error=You do not have access to this lead.');
    }

    const activity = await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: req.body.type || 'note',
      note: req.body.note,
      nextFollowUpAt: req.body.nextFollowUpAt || null
    });

    customer.lastContactedAt = new Date();
    customer.nextFollowUpAt = activity.nextFollowUpAt || customer.nextFollowUpAt;
    await customer.save();
    await logAudit(req, {
      action: 'activity_create',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `${activity.type} activity logged for "${customer.name}".`
    });

    res.redirect(`/customers/${customer._id}`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/transfer', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization }).populate('assignedTo');
    if (!customer) return res.status(404).render('errors/404', { title: 'Customer not found' });

    const newAssigneeId = req.body.assignedTo || null;
    let newAssigneeName = 'Unassigned';
    
    if (newAssigneeId) {
      const newUser = await User.findOne({ _id: newAssigneeId, organization });
      if (newUser) {
        newAssigneeName = newUser.name;
      }
    }

    const previousAssigneeName = customer.assignedTo ? customer.assignedTo.name : 'Unassigned';
    const previousOwnerId = customer.assignedTo?._id || customer.assignedTo;
    customer.assignedTo = newAssigneeId;
    await customer.save();
    if (String(previousOwnerId || '') !== String(customer.assignedTo || '')) await runLeadAutomation({ customer, trigger: 'owner_changed' });

    // Log in timeline
    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'note',
      note: `Lead transferred from ${previousAssigneeName} to ${newAssigneeName}.`
    });
    await logAudit(req, {
      action: 'transfer',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Lead transferred from ${previousAssigneeName} to ${newAssigneeName}.`,
      metadata: { previousAssigneeName, newAssigneeName, newAssigneeId }
    });

    // Send notification
    if (newAssigneeId && String(newAssigneeId) !== String(req.user._id)) {
      await Notification.create({
        organization,
        user: newAssigneeId,
        title: 'New Lead Transferred to You',
        message: `Lead "${customer.name}" has been transferred to you by ${req.user.name}.`,
        link: `/customers/${customer._id}`
      });
    }

    res.redirect(`/customers/${customer._id}`);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermission('businesses.delete'), async (req, res, next) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.params.id, organization });
    await Promise.all([
      Activity.deleteMany({ organization, customer: req.params.id }),
      Attachment.deleteMany({ organization, customer: req.params.id }),
      Customer.deleteOne({ _id: req.params.id, organization })
    ]);
    await logAudit(req, {
      action: 'delete',
      entityType: 'customer',
      entityId: req.params.id,
      entityName: customer ? customer.name : '',
      message: `Lead "${customer ? customer.name : req.params.id}" deleted.`
    });
    res.redirect('/customers');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
