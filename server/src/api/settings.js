const express = require('express');
const { requireApiAuth } = require('./middleware/auth');
const CrmStage = require('../models/CrmStage');
const CrmLabel = require('../models/CrmLabel');
const CustomField = require('../models/CustomField');
const WorkType = require('../models/WorkType');
const Organization = require('../models/Organization');
const ClientCompany = require('../models/ClientCompany');
const AutomationRule = require('../models/AutomationRule');
const Customer = require('../models/Customer');
const CustomRecord = require('../models/CustomRecord');
const CustomRole = require('../models/CustomRole');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const { slugify } = require('../utils/slug');
const { logAudit } = require('../utils/audit');
const crmPresets = require('../config/crmPresets');

const router = express.Router();
router.use(requireApiAuth);
const apiPermission = require('./middleware/permission');
router.use(apiPermission('settings.view'));
router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : apiPermission('settings.update')(req, res, next));

function workspace(req, res) {
  if (req.activeCompanyId) return String(req.activeCompanyId);
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

// ==================== SETUP WIZARD ====================

// GET /api/settings/setup — Setup wizard data (admin only)
router.get('/setup', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const organization = req.user.organization._id;
    const companyId = workspace(req, res);
    if (!companyId) return;

    const [company, teamCount, stageCount, fieldCount, labelCount, leadCount, workTypeCount, campaignCount, totalCompanyCount, hasDemoData] = await Promise.all([
      ClientCompany.findOne({ _id: companyId, organization }).select('name website contactPerson email phone').lean(),
      User.countDocuments({ organization, isActive: true }),
      CrmStage.countDocuments({ organization, clientCompany: companyId, isActive: true }),
      CustomField.countDocuments({ organization, clientCompany: companyId, entity: 'customer', isActive: true }),
      CrmLabel.countDocuments({ organization, clientCompany: companyId, isActive: true }),
      Customer.countDocuments({ organization, clientCompany: companyId }),
      WorkType.countDocuments({ organization, clientCompany: companyId, isActive: true }),
      Campaign.countDocuments({ organization, clientCompany: companyId, status: { $ne: 'archived' } }),
      ClientCompany.countDocuments({ organization }),
      Customer.exists({ organization, clientCompany: companyId, email: { $in: ['aarav.sharma@example.com', 'neha.patel@example.com', 'rohan.das@example.com'] } })
    ]);

    const steps = [
      { title: 'Company profile', detail: 'Add the business contact details for this CRM workspace.', href: `/companies/${companyId}`, done: Boolean(company?.website || company?.contactPerson || company?.email || company?.phone), action: 'Set up profile' },
      { title: 'Team access', detail: 'Invite the people who will use this CRM and give them the right role.', href: '/team', done: teamCount > 1, action: 'Manage team' },
      { title: 'Pipeline', detail: 'Rename stages so they match how this company sells.', href: '/settings#stages', done: stageCount > 0, action: 'Customize stages' },
      { title: 'Fields and labels', detail: 'Add the information and tags this company needs to track.', href: '/settings#fields', done: fieldCount > 0 || labelCount > 0, action: 'Customize CRM' },
      { title: 'Import existing leads', detail: 'Upload a CSV, review duplicates and mapping, then confirm the import.', href: '/customers', done: leadCount > 0, action: 'Import leads' },
      { title: 'Work types and targets', detail: 'Choose the work your team delivers and set the fields and statuses it needs.', href: '/settings#work-types', done: workTypeCount > 0, action: 'Customize work' },
      { title: 'Campaigns and integrations', detail: 'Optional: add active campaigns or connect lead and reporting sources.', href: '/campaigns', done: campaignCount > 0, optional: true, action: 'Configure optional tools' },
      { title: 'Review and launch', detail: 'Open the dashboard and start working from the CRM you configured.', href: '/', done: false, action: 'Open dashboard' }
    ];
    const requiredSteps = steps.filter(step => !step.optional && step.title !== 'Review and launch');
    steps[steps.length - 1].done = requiredSteps.every(step => step.done);

    res.json({
      ok: true,
      title: `Set up ${company?.name || 'CRM'}`,
      company,
      steps,
      completedSteps: requiredSteps.filter(step => step.done).length,
      requiredStepCount: requiredSteps.length,
      isFirstCompany: totalCompanyCount === 1,
      leadCount,
      hasDemoData: Boolean(hasDemoData),
      presets: crmPresets,
    });
  } catch (error) { next(error); }
});

// POST /api/settings/setup/preset — Apply an industry preset (admin only)
router.post('/setup/preset', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const preset = crmPresets[req.body.preset];
    const organization = req.user.organization._id;
    const clientCompany = workspace(req, res);
    if (!clientCompany) return;
    if (!preset || req.body.confirm !== 'replace') {
      return res.status(400).json({ ok: false, error: 'Choose a preset and confirm the replacement.' });
    }

    const { deleteOnboardingData } = require('../services/defaults');
    await deleteOnboardingData(organization, clientCompany);

    if (await Customer.exists({ organization, clientCompany })) {
      return res.status(400).json({ ok: false, error: 'Presets can only be applied before leads are imported.' });
    }
    await Promise.all([CrmStage.deleteMany({ organization, clientCompany }), CrmLabel.deleteMany({ organization, clientCompany }), CustomField.deleteMany({ organization, clientCompany, entity: 'customer' })]);
    await CrmStage.insertMany(preset.stages.map((stage, index) => ({ organization, clientCompany, name: stage.name, key: slugify(stage.name), order: (index + 1) * 10, isDefault: index === 0, isWon: stage.isWon === true, isLost: stage.isLost === true })));
    await CrmLabel.insertMany(preset.labels.map(name => ({ organization, clientCompany, name })));
    await CustomField.insertMany(preset.fields.map(([label, type = 'text', options = []], index) => ({ organization, clientCompany, entity: 'customer', label, key: slugify(label), type, options, order: (index + 1) * 10 })));

    await logAudit(req, { action: 'preset_apply', entityType: 'crm_preset', entityName: preset.label, message: `Applied ${preset.label} CRM preset.` });
    res.json({ ok: true, message: 'Preset applied. You can customize everything next.' });
  } catch (error) { next(error); }
});

// POST /api/settings/setup/clear-demo — Clear onboarding demo data (admin only)
router.post('/setup/clear-demo', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const organization = req.user.organization._id;
    const clientCompany = workspace(req, res);
    if (!clientCompany) return;
    const { deleteOnboardingData } = require('../services/defaults');
    await deleteOnboardingData(organization, clientCompany);
    await logAudit(req, { action: 'clear_demo_data', entityType: 'crm_setup', message: 'Cleared onboarding demo data.' });
    res.json({ ok: true, message: 'Onboarding demo data cleared.' });
  } catch (error) { next(error); }
});

// POST /api/settings/setup/load-demo — Load onboarding demo data (admin only)
router.post('/setup/load-demo', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const organization = req.user.organization._id;
    const clientCompany = workspace(req, res);
    if (!clientCompany) return;
    const { seedOnboardingData } = require('../services/defaults');
    await seedOnboardingData(organization, clientCompany);
    await logAudit(req, { action: 'load_demo_data', entityType: 'crm_setup', message: 'Loaded onboarding demo data.' });
    res.json({ ok: true, message: 'Onboarding demo data loaded. Go to the dashboard to explore!' });
  } catch (error) { next(error); }
});

// GET /api/settings — Settings overview data
router.get('/', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    const [stages, labels, fields, workTypes, automations, orgDoc, companyDoc, users] = await Promise.all([
      CrmStage.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ order: 1, createdAt: 1 }).lean(),
      CrmLabel.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ name: 1 }).lean(),
      CustomField.find({ organization, clientCompany: activeWorkspace, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }).lean(),
      WorkType.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ order: 1, name: 1 }).lean(),
      AutomationRule.find({ organization, clientCompany: activeWorkspace }).sort({ createdAt: -1 }).lean(),
      Organization.findById(organization).lean(),
      ClientCompany.findById(activeWorkspace).lean(),
      User.find({ organization, isActive: true }).select('name role').sort({ name: 1 }).lean(),
    ]);

    res.json({
      ok: true,
      stages,
      labels,
      fields,
      workTypes,
      automations,
      users,
      organization: orgDoc,
      terminology: companyDoc?.terminology || {
        leadSingular: 'Lead',
        leadPlural: 'Leads',
        recordSingular: 'Deliverable',
        recordPlural: 'Deliverables',
        pipelineName: 'Pipeline',
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==================== STAGES ====================

// POST /api/settings/stages — Create stage
router.post('/stages', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { name, color, isWon, isLost, isDefault } = req.body;

    const trimmedName = String(name || '').trim();
    const key = slugify(trimmedName);
    if (!trimmedName || !key) {
      return res.status(400).json({ ok: false, error: 'Stage name is required.' });
    }

    if (isWon && isLost) {
      return res.status(400).json({ ok: false, error: 'A stage cannot be both Won and Lost.' });
    }

    const duplicate = await CrmStage.findOne({ organization, clientCompany: activeWorkspace, key });
    if (duplicate) {
      return res.status(400).json({ ok: false, error: `A stage named "${trimmedName}" already exists.` });
    }

    if (isDefault) {
      await CrmStage.updateMany({ organization, clientCompany: activeWorkspace }, { isDefault: false });
    }

    const count = await CrmStage.countDocuments({ organization, clientCompany: activeWorkspace });
    const stage = await CrmStage.create({
      organization,
      clientCompany: activeWorkspace,
      name: trimmedName,
      key,
      color: color || '#475569',
      order: (count + 1) * 10,
      isWon: Boolean(isWon),
      isLost: Boolean(isLost),
      isDefault: Boolean(isDefault),
      isActive: true,
    });

    await logAudit(req, {
      action: 'create',
      entityType: 'crm_stage',
      entityId: stage._id,
      entityName: stage.name,
      message: `Stage "${stage.name}" created.`,
    });

    res.json({ ok: true, data: stage });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/stages/:id — Update stage
router.put('/stages/:id', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { name, color, isWon, isLost, isDefault, isActive, order } = req.body;

    const stage = await CrmStage.findOne({ _id: req.params.id, organization, clientCompany: activeWorkspace });
    if (!stage) {
      return res.status(404).json({ ok: false, error: 'Stage not found.' });
    }

    if (name) stage.name = String(name).trim();
    if (color) stage.color = color;
    if (isWon !== undefined) stage.isWon = Boolean(isWon);
    if (isLost !== undefined) stage.isLost = Boolean(isLost);
    if (isActive !== undefined) stage.isActive = Boolean(isActive);
    if (order !== undefined) stage.order = Number(order);

    if (isDefault) {
      await CrmStage.updateMany({ organization, clientCompany: activeWorkspace }, { isDefault: false });
      stage.isDefault = true;
    }

    await stage.save();

    await logAudit(req, {
      action: 'update',
      entityType: 'crm_stage',
      entityId: stage._id,
      entityName: stage.name,
      message: `Stage "${stage.name}" updated.`,
    });

    res.json({ ok: true, data: stage });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/settings/stages/:id — Delete stage
router.delete('/stages/:id', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    const stage = await CrmStage.findOne({ _id: req.params.id, organization, clientCompany: activeWorkspace });
    if (!stage) {
      return res.status(404).json({ ok: false, error: 'Stage not found.' });
    }

    const hasLeads = await Customer.exists({ organization, clientCompany: activeWorkspace, stage: stage._id });
    if (hasLeads) {
      return res.status(400).json({ ok: false, error: 'Cannot delete stage with active leads assigned to it.' });
    }

    await CrmStage.deleteOne({ _id: stage._id });

    await logAudit(req, {
      action: 'delete',
      entityType: 'crm_stage',
      entityId: req.params.id,
      entityName: stage.name,
      message: `Stage "${stage.name}" deleted.`,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings/stages/reorder — Reorder stages
router.post('/stages/reorder', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { stageIds } = req.body;

    if (Array.isArray(stageIds)) {
      await Promise.all(
        stageIds.map((id, index) =>
          CrmStage.updateOne({ _id: id, organization, clientCompany: activeWorkspace }, { order: (index + 1) * 10 })
        )
      );
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings/fields/reorder — Reorder custom fields
router.post('/fields/reorder', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { fieldIds } = req.body;

    if (Array.isArray(fieldIds)) {
      await Promise.all(
        fieldIds.map((id, index) =>
          CustomField.updateOne({ _id: id, organization, clientCompany: activeWorkspace, entity: 'customer' }, { order: (index + 1) * 10 })
        )
      );
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ==================== CUSTOM FIELDS ====================

// POST /api/settings/fields — Create custom field
router.post('/fields', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { label, type, options, required } = req.body;

    const trimmedLabel = String(label || '').trim();
    const key = slugify(trimmedLabel);
    if (!trimmedLabel || !key) {
      return res.status(400).json({ ok: false, error: 'Field label is required.' });
    }

    const count = await CustomField.countDocuments({ organization, clientCompany: activeWorkspace, entity: 'customer' });
    const field = await CustomField.create({
      organization,
      clientCompany: activeWorkspace,
      entity: 'customer',
      label: trimmedLabel,
      key,
      type: type || 'text',
      options: Array.isArray(options) ? options : [],
      required: Boolean(required),
      order: (count + 1) * 10,
      isActive: true,
    });

    res.json({ ok: true, data: field });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/fields/:id — Update custom field
router.put('/fields/:id', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { label, type, options, required, isActive, order } = req.body;

    const field = await CustomField.findOne({ _id: req.params.id, organization, clientCompany: activeWorkspace });
    if (!field) {
      return res.status(404).json({ ok: false, error: 'Field not found.' });
    }

    if (label) field.label = String(label).trim();
    if (type) field.type = String(type);
    if (options !== undefined) field.options = Array.isArray(options) ? options : [];
    if (required !== undefined) field.required = Boolean(required);
    if (isActive !== undefined) field.isActive = Boolean(isActive);
    if (order !== undefined) field.order = Number(order);

    await field.save();
    res.json({ ok: true, data: field });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/settings/fields/:id — Delete custom field
router.delete('/fields/:id', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    await CustomField.deleteOne({ _id: req.params.id, organization, clientCompany: activeWorkspace });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ==================== LABELS ====================

// POST /api/settings/labels — Create label
router.post('/labels', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { name, color, isHighPotential } = req.body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ ok: false, error: 'Label name is required.' });
    }

    const label = await CrmLabel.create({
      organization,
      clientCompany: activeWorkspace,
      name: trimmedName,
      color: color || '#64748b',
      isHighPotential: Boolean(isHighPotential),
      isActive: true,
    });

    res.json({ ok: true, data: label });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/labels/:id - Update label
router.put('/labels/:id', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { name, color, isHighPotential, isActive } = req.body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ ok: false, error: 'Label name is required.' });
    }

    const label = await CrmLabel.findOneAndUpdate(
      { _id: req.params.id, organization, clientCompany: activeWorkspace },
      {
        name: trimmedName,
        color: color || '#64748b',
        isHighPotential: Boolean(isHighPotential),
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
      { new: true }
    );

    if (!label) return res.status(404).json({ ok: false, error: 'Label not found.' });
    res.json({ ok: true, data: label });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/settings/labels/:id — Delete label
router.delete('/labels/:id', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    await CrmLabel.deleteOne({ _id: req.params.id, organization, clientCompany: activeWorkspace });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ==================== TERMINOLOGY & THEME ====================

// PUT /api/settings/terminology — Update terminology
router.put('/terminology', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const { leadSingular, leadPlural, recordSingular, recordPlural, pipelineName } = req.body;

    const terminology = {
      leadSingular: String(leadSingular || 'Lead').trim(),
      leadPlural: String(leadPlural || 'Leads').trim(),
      recordSingular: String(recordSingular || 'Deliverable').trim(),
      recordPlural: String(recordPlural || 'Deliverables').trim(),
      pipelineName: String(pipelineName || 'Pipeline').trim(),
    };

    await ClientCompany.updateOne({ _id: activeWorkspace, organization }, { terminology });
    res.json({ ok: true, data: terminology });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/theme — Update theme
router.put('/theme', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { gold, teal, background, surface, text } = req.body;

    const theme = {
      gold: gold || '#b58d00',
      teal: teal || '#0f766e',
      background: background || '#ffffff',
      surface: surface || '#ffffff',
      text: text || '#121214',
    };

    await Organization.updateOne({ _id: organization }, { theme });
    res.json({ ok: true, data: theme });
  } catch (error) {
    next(error);
  }
});

const workFieldTypes = new Set(['text', 'textarea', 'number', 'currency', 'percentage', 'date', 'datetime', 'email', 'phone', 'select', 'checkbox', 'url', 'user-picker', 'company-picker', 'customer-picker', 'module-picker']);

function workTypeParts(body) {
  const name = String(body.name || '').trim();
  const key = slugify(body.key || name);
  if (!name || !key) throw new Error('Work type name and key are required.');
  const statuses = JSON.parse(typeof body.statuses === 'string' ? body.statuses : JSON.stringify(body.statuses || '[]'));
  const fields = JSON.parse(typeof body.fields === 'string' ? body.fields : JSON.stringify(body.fields || '[]'));
  const presentation = JSON.parse(typeof body.presentation === 'string' ? body.presentation : JSON.stringify(body.presentation || {}));
  if (!Array.isArray(statuses) || !statuses.length || statuses.some(status => !status.key || !status.label)) throw new Error('Statuses must be a non-empty JSON array with key and label.');
  if (!Array.isArray(fields) || fields.some(field => !field.key || !field.label)) throw new Error('Fields must be a JSON array with key and label.');
  if (new Set(statuses.map(status => status.key)).size !== statuses.length || new Set(fields.map(field => field.key)).size !== fields.length) throw new Error('Status and field keys must be unique.');
  if ([...statuses, ...fields].some(item => !/^[a-zA-Z0-9_-]+$/.test(item.key))) throw new Error('Status and field keys may only contain letters, numbers, dashes, and underscores.');
  if (fields.some(field => !workFieldTypes.has(field.type))) throw new Error('A field has an unsupported data type.');
  if (fields.some(field => field.type === 'select' && (!Array.isArray(field.options) || !field.options.length))) throw new Error('Every dropdown field needs at least one option.');
  if (fields.some(field => field.min != null && field.max != null && Number(field.min) > Number(field.max))) throw new Error('A field minimum cannot be greater than its maximum.');
  const views = ['overview', 'list', 'board', 'calendar'];
  const enabledViews = [...new Set(Array.isArray(presentation.enabledViews) ? presentation.enabledViews : views)].filter(view => views.includes(view));
  if (!enabledViews.length) throw new Error('Enable at least one module view.');
  const allowedFields = new Set(['title', 'assignedTo', 'collaborators', 'secondaryAssignee', 'relatedRecords', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes', ...fields.map(field => `custom:${field.key}`)]);
  const cleanFields = (value, fallback) => [...new Set(Array.isArray(value) ? value : fallback)].filter(field => allowedFields.has(field));
  const dateFields = new Set(['deadline', 'startDate', 'deliveredAt', ...fields.filter(field => ['date', 'datetime'].includes(field.type)).map(field => `custom:${field.key}`)]);
  const defaultView = enabledViews.includes(presentation.defaultView) ? presentation.defaultView : enabledViews[0];
  const calendarField = dateFields.has(presentation.calendarField) ? presentation.calendarField : 'deadline';
  const fieldLabels = Object.fromEntries(Object.entries(presentation.fieldLabels || {})
    .filter(([field, label]) => allowedFields.has(field) && String(label).trim())
    .map(([field, label]) => [field, String(label).trim().slice(0, 80)]));
  return {
    name, key, statuses, fields, icon: String(body.icon || 'clipboard-list'), color: body.color || '#64748b', order: Number(body.order) || 0, isActive: body.isActive === 'on' || body.isActive === true,
    presentation: {
      enabledViews, defaultView, calendarField,
      listColumns: cleanFields(presentation.listColumns, ['title', 'assignedTo', 'status', 'deadline']),
      boardFields: cleanFields(presentation.boardFields, ['assignedTo', 'priority', 'deadline']),
      filterFields: cleanFields(presentation.filterFields, ['status', 'assignedTo', 'priority']),
      overviewGroupFields: cleanFields(presentation.overviewGroupFields, []),
      overviewProgressFields: cleanFields(presentation.overviewProgressFields, []).filter(field => fields.find(item => `custom:${item.key}` === field)?.type === 'select'),
      overviewCompleteValue: String(presentation.overviewCompleteValue || 'Done').trim().slice(0, 80) || 'Done',
      fieldLabels
    }
  };
}

async function validateWorkTypeChange(organization, clientCompany, workTypeId, current, next) {
  const itemFilter = { organization, workspace: clientCompany, module: workTypeId };
  const nextStatuses = new Set(next.statuses.map(status => status.key));
  const removedStatuses = current.statuses.filter(status => !nextStatuses.has(status.key)).map(status => status.key);
  if (removedStatuses.length && await CustomRecord.exists({ ...itemFilter, status: { $in: removedStatuses } })) {
    throw new Error('Move records out of removed statuses before saving this module.');
  }
  if (removedStatuses.length && await AutomationRule.exists({ workType: workTypeId, $or: [{ status: { $in: removedStatuses } }, { action: 'set_status', actionValue: { $in: removedStatuses } }] })) {
    throw new Error('Update or delete automations that use removed statuses before saving this module.');
  }

  const nextFields = new Map(next.fields.map(field => [field.key, field]));
  for (const field of current.fields) {
    const replacement = nextFields.get(field.key);
    if (!replacement) {
      if (await AutomationRule.exists({ workType: workTypeId, $or: [{ conditionField: `custom:${field.key}` }, { action: 'set_field', actionField: field.key }] })) {
        throw new Error(`Field "${field.label}" is used by an automation. Update or delete that rule first.`);
      }
      await CustomRecord.updateMany(itemFilter, { $unset: { [`customFields.${field.key}`]: 1 } });
    }
  }
}

// ==================== AUTOMATIONS ====================

router.post('/automations', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const organization = req.user.organization._id, clientCompany = workspace(req, res);
    if (!clientCompany) return;
    const entityType = req.body.entityType === 'module' ? 'module' : 'lead';
    if (entityType === 'module') {
      const workType = await WorkType.findOne({ _id: req.body.workType, organization, clientCompany, isActive: true });
      const trigger = ['record_created', 'status_changed', 'owner_changed'].includes(req.body.trigger) ? req.body.trigger : '';
      const action = ['assign_user', 'set_priority', 'set_status', 'set_field'].includes(req.body.action) ? req.body.action : '';
      const conditionField = String(req.body.conditionField || '');
      const customCondition = conditionField.startsWith('custom:') ? workType?.fields.find(field => field.key === conditionField.slice(7)) : null;
      const validCondition = !conditionField || ['title', 'status', 'priority', 'assignedTo'].includes(conditionField) || customCondition;
      const status = String(req.body.status || '');
      const actionField = action === 'set_field' ? String(req.body.actionField || '') : '';
      const field = workType?.fields.find(item => item.key === actionField);
      const actionValue = action === 'set_priority' ? req.body.priority : action === 'set_status' ? req.body.targetStatus : action === 'set_field' ? String(req.body.fieldValue ?? '') : '';
      const targetId = action === 'assign_user' ? req.body.targetUserId : null;
      const validStatus = value => !value || workType?.statuses.some(item => item.key === value);
      const validFieldValue = !field || (field.type !== 'select' || field.options.includes(actionValue)) && (!['number', 'currency', 'percentage'].includes(field.type) || actionValue !== '' && Number.isFinite(Number(actionValue))) && (field.type !== 'checkbox' || ['true', 'false'].includes(actionValue));
      if (!workType || !trigger || !action || !validCondition || !validStatus(status) || (action === 'assign_user' && !targetId) || (action === 'set_priority' && !['low', 'medium', 'high'].includes(actionValue)) || (action === 'set_status' && (!actionValue || !validStatus(actionValue))) || (action === 'set_field' && (!field || !validFieldValue))) return res.status(400).json({ ok: false, error: 'Choose valid module automation options.' });
      if (targetId && !await User.exists({ _id: targetId, organization, isActive: true })) return res.status(400).json({ ok: false, error: 'Invalid team member.' });
      const rule = await AutomationRule.create({ organization, clientCompany, entityType, workType: workType._id, name: String(req.body.name || '').trim() || 'Automation rule', trigger, status, conditionField, conditionValue: String(req.body.conditionValue || '').trim(), action, targetId, actionField, actionValue });
      return res.json({ ok: true, data: rule });
    }
    const trigger = ['lead_created', 'stage_changed', 'owner_changed'].includes(req.body.trigger) ? req.body.trigger : '';
    const action = ['assign_user', 'add_label', 'remove_label', 'set_priority', 'create_record'].includes(req.body.action) ? req.body.action : '';
    const targetId = action === 'assign_user' ? req.body.targetUserId : ['add_label', 'remove_label'].includes(action) ? req.body.targetLabelId : action === 'create_record' ? req.body.targetWorkTypeId : null;
    const actionValue = action === 'set_priority' ? req.body.priority : '';
    const conditionField = ['source', 'priority'].includes(req.body.conditionField) ? req.body.conditionField : '';
    const conditionValue = conditionField ? String(req.body.conditionValue || '').trim() : '';
    if (!trigger || !action || ((['assign_user', 'add_label', 'remove_label', 'create_record'].includes(action) && !targetId) || (action === 'set_priority' && !['low', 'medium', 'high'].includes(actionValue)))) return res.status(400).json({ ok: false, error: 'Choose a valid trigger and action.' });
    if (req.body.stage && !await CrmStage.exists({ _id: req.body.stage, organization, clientCompany })) return res.status(400).json({ ok: false, error: 'Invalid stage.' });
    if (targetId) {
      const targetModel = action === 'assign_user' ? User : action === 'create_record' ? WorkType : CrmLabel;
      if (!await targetModel.exists({ _id: targetId, organization, ...(action === 'assign_user' ? {} : { clientCompany }) })) return res.status(400).json({ ok: false, error: 'Invalid action target.' });
    }
    const rule = await AutomationRule.create({ organization, clientCompany, entityType, name: String(req.body.name || '').trim() || 'Automation rule', trigger, stage: req.body.stage || null, conditionField, conditionValue, action, targetId, actionValue });
    res.json({ ok: true, data: rule });
  } catch (error) { next(error); }
});

router.post('/automations/:id/toggle', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const clientCompany = workspace(req, res);
    if (!clientCompany) return;
    const rule = await AutomationRule.findOne({ _id: req.params.id, organization: req.user.organization._id, clientCompany });
    if (!rule) return res.status(404).json({ ok: false, error: 'Automation rule not found' });
    rule.isActive = !rule.isActive;
    await rule.save();
    res.json({ ok: true, data: rule });
  } catch (error) { next(error); }
});

router.post('/automations/:id/delete', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const clientCompany = workspace(req, res);
    if (!clientCompany) return;
    await AutomationRule.deleteOne({ _id: req.params.id, organization: req.user.organization._id, clientCompany });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ==================== WORK TYPES (CUSTOM MODULES) ====================

router.post('/work-types', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const organization = req.user.organization._id, clientCompany = workspace(req, res);
    if (!clientCompany) return;
    const data = workTypeParts(req.body);
    const duplicate = await WorkType.findOne({ organization, clientCompany, key: data.key });
    if (duplicate) return res.status(400).json({ ok: false, error: `A work type with key "${data.key}" already exists.` });
    const workType = await WorkType.create({ organization, clientCompany, ...data, isActive: true });
    await logAudit(req, { action: 'create', entityType: 'work_type', entityId: workType._id, entityName: workType.name, message: `Work type "${workType.name}" created.` });
    res.json({ ok: true, data: workType });
  } catch (error) {
    if (error instanceof SyntaxError || /must be|required|unique|unsupported|dropdown|minimum|may only|module view/.test(error.message)) return res.status(400).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/work-types/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const organization = req.user.organization._id, clientCompany = workspace(req, res);
    if (!clientCompany) return;
    const current = await WorkType.findOne({ _id: req.params.id, organization, clientCompany });
    if (!current) return res.status(404).json({ ok: false, error: 'Work type not found' });
    const data = workTypeParts(req.body);
    data.key = current.key;
    await validateWorkTypeChange(organization, clientCompany, current._id, current, data);
    await WorkType.updateOne({ _id: current._id }, data);
    await logAudit(req, { action: 'update', entityType: 'work_type', entityId: current._id, entityName: data.name, message: `Work type "${data.name}" updated.` });
    res.json({ ok: true, data });
  } catch (error) {
    if (error instanceof SyntaxError || /must be|required|unique|unsupported|dropdown|minimum|may only|module view|Move records|contains data|automations|used by an automation/.test(error.message)) return res.status(400).json({ ok: false, error: error.message });
    next(error);
  }
});

router.delete('/work-types/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Access denied' });
    const organization = req.user.organization._id, clientCompany = workspace(req, res);
    if (!clientCompany) return;
    const filter = { _id: req.params.id, organization, clientCompany };
    const workType = await WorkType.findOne(filter);
    if (!workType) return res.status(404).json({ ok: false, error: 'Work type not found' });
    await CustomRecord.deleteMany({ organization, workspace: clientCompany, module: workType._id });
    await CustomRole.updateMany({ organization }, { $pull: { workTypePermissions: { workTypeId: workType._id } } });
    await AutomationRule.deleteMany({ organization, clientCompany, workType: workType._id });
    await WorkType.deleteOne(filter);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
