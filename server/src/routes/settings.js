const express = require('express');

const CrmLabel = require('../models/CrmLabel');
const { isPotentialLabel } = require('../utils/leadPotential');
const CrmStage = require('../models/CrmStage');
const CustomField = require('../models/CustomField');
const CustomRole = require('../models/CustomRole');
const Customer = require('../models/Customer');
const Organization = require('../models/Organization');
const CustomRecord = require('../models/CustomRecord');
const WorkType = require('../models/WorkType');
const User = require('../models/User');
const ClientCompany = require('../models/ClientCompany');
const Campaign = require('../models/Campaign');
const AutomationRule = require('../models/AutomationRule');
const { requirePermission } = require('../middleware/auth');
const { slugify } = require('../utils/slug');
const { logAudit } = require('../utils/audit');
const crmPresets = require('../config/crmPresets');

const router = express.Router();
const workFieldTypes = new Set(['text', 'textarea', 'number', 'currency', 'percentage', 'date', 'datetime', 'email', 'phone', 'select', 'checkbox', 'url', 'user-picker', 'company-picker', 'customer-picker', 'module-picker']);

router.use(requirePermission('settings.view'));
router.use((req, res, next) => req.method === 'GET' ? next() : requirePermission('settings.update')(req, res, next));

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function settingsRedirect(message) {
  return `/settings?error=${encodeURIComponent(message)}`;
}

// This stays a hub, not a second configuration system: every step opens the existing, audited screen.
router.get('/setup', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).render('errors/403', { title: 'Access denied' });
    const organization = req.user.organization._id;
    const companyId = req.activeCompany?._id;
    if (!companyId) return res.redirect('/companies?error=Create+a+CRM+workspace+before+starting+setup.');

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
      { title: 'Import existing leads', detail: 'Upload a CSV, review duplicates and mapping, then confirm the import.', href: '/customers/import', done: leadCount > 0, action: 'Import leads' },
      { title: 'Work types and targets', detail: 'Choose the work your team delivers and set the fields and statuses it needs.', href: '/settings#work-types', done: workTypeCount > 0, action: 'Customize work' },
      { title: 'Campaigns and integrations', detail: 'Optional: add active campaigns or connect lead and reporting sources.', href: '/campaigns', done: campaignCount > 0, optional: true, action: 'Configure optional tools' },
      { title: 'Review and launch', detail: 'Open the dashboard and start working from the CRM you configured.', href: '/', done: false, action: 'Open dashboard' }
    ];
    const requiredSteps = steps.filter(step => !step.optional && step.title !== 'Review and launch');
    steps[steps.length - 1].done = requiredSteps.every(step => step.done);

    res.render('settings/setup', {
      title: `Set up ${company?.name || 'CRM'}`,
      company,
      steps,
      completedSteps: requiredSteps.filter(step => step.done).length,
      requiredStepCount: requiredSteps.length,
      isFirstCompany: totalCompanyCount === 1,
      leadCount,
      hasDemoData: Boolean(hasDemoData),
      presets: crmPresets,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/setup/preset', async (req, res, next) => {
  try {
    const preset = crmPresets[req.body.preset];
    const organization = req.user.organization._id;
    const clientCompany = req.activeCompany._id;
    if (!preset || req.body.confirm !== 'replace') return res.redirect('/settings/setup?error=Choose+a+preset+and+confirm+the+replacement.');

    const { deleteOnboardingData } = require('../services/defaults');
    await deleteOnboardingData(organization, clientCompany);

    if (await Customer.exists({ organization, clientCompany })) return res.redirect('/settings/setup?error=Presets+can+only+be+applied+before+leads+are+imported.');
    await Promise.all([CrmStage.deleteMany({ organization, clientCompany }), CrmLabel.deleteMany({ organization, clientCompany }), CustomField.deleteMany({ organization, clientCompany, entity: 'customer' })]);
    await CrmStage.insertMany(preset.stages.map((stage, index) => ({ organization, clientCompany, name: stage.name, key: slugify(stage.name), order: (index + 1) * 10, isDefault: index === 0, isWon: stage.isWon === true, isLost: stage.isLost === true })));
    await CrmLabel.insertMany(preset.labels.map(name => ({ organization, clientCompany, name })));
    await CustomField.insertMany(preset.fields.map(([label, type = 'text', options = []], index) => ({ organization, clientCompany, entity: 'customer', label, key: slugify(label), type, options, order: (index + 1) * 10 })));

    await logAudit(req, { action: 'preset_apply', entityType: 'crm_preset', entityName: preset.label, message: `Applied ${preset.label} CRM preset.` });
    res.redirect('/settings/setup?success=Preset+applied.+You+can+customize+everything+next.');
  } catch (error) { next(error); }
});

router.post('/setup/clear-demo', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const clientCompany = req.activeCompany._id;
    const { deleteOnboardingData } = require('../services/defaults');
    await deleteOnboardingData(organization, clientCompany);
    await logAudit(req, { action: 'clear_demo_data', entityType: 'crm_setup', message: 'Cleared onboarding demo data.' });
    res.redirect('/settings/setup?success=Onboarding+demo+data+cleared.');
  } catch (error) { next(error); }
});

router.post('/setup/load-demo', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const clientCompany = req.activeCompany._id;
    const { seedOnboardingData } = require('../services/defaults');
    await seedOnboardingData(organization, clientCompany);
    await logAudit(req, { action: 'load_demo_data', entityType: 'crm_setup', message: 'Loaded onboarding demo data.' });
    res.redirect('/settings/setup?success=Onboarding+demo+data+loaded.+Go+to+the+dashboard+to+explore!');
  } catch (error) { next(error); }
});

function workTypeParts(body) {
  const name = String(body.name || '').trim();
  const key = slugify(body.key || name);
  if (!name || !key) throw new Error('Work type name and key are required.');
  const statuses = JSON.parse(body.statuses || '[]');
  const fields = JSON.parse(body.fields || '[]');
  const presentation = JSON.parse(body.presentation || '{}');
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
    name, key, statuses, fields, icon: String(body.icon || 'clipboard-list'), color: body.color || '#64748b', order: Number(body.order) || 0, isActive: body.isActive === 'on',
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

async function validateWorkTypeChange(current, next) {
  const itemFilter = { organization: current.organization, workspace: current.clientCompany, module: current._id };
  const nextStatuses = new Set(next.statuses.map(status => status.key));
  const removedStatuses = current.statuses.filter(status => !nextStatuses.has(status.key)).map(status => status.key);
  if (removedStatuses.length && await CustomRecord.exists({ ...itemFilter, status: { $in: removedStatuses } })) {
    throw new Error('Move records out of removed statuses before saving this module.');
  }
  if (removedStatuses.length && await AutomationRule.exists({ workType: current._id, $or: [{ status: { $in: removedStatuses } }, { action: 'set_status', actionValue: { $in: removedStatuses } }] })) {
    throw new Error('Update or delete automations that use removed statuses before saving this module.');
  }

  const nextFields = new Map(next.fields.map(field => [field.key, field]));
  for (const field of current.fields) {
    const replacement = nextFields.get(field.key);
    if (!replacement) {
      if (await AutomationRule.exists({ workType: current._id, $or: [{ conditionField: `custom:${field.key}` }, { action: 'set_field', actionField: field.key }] })) {
        throw new Error(`Field "${field.label}" is used by an automation. Update or delete that rule first.`);
      }
      await CustomRecord.updateMany(itemFilter, { $unset: { [`customFields.${field.key}`]: 1 } });
    }
  }
}

router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const [stages, labels, fields, workTypes, automationRules, users] = await Promise.all([
      CrmStage.find({ organization, clientCompany: req.activeCompany._id }).sort({ order: 1, createdAt: 1 }),
      CrmLabel.find({ organization, clientCompany: req.activeCompany._id }).sort({ name: 1 }),
      CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer' }).sort({ order: 1, createdAt: 1 }),
      WorkType.find({ organization, clientCompany: req.activeCompany._id }).sort({ order: 1, createdAt: 1 }),
      AutomationRule.find({ organization, clientCompany: req.activeCompany._id }).populate('stage targetId workType').sort({ createdAt: -1 }),
      User.find({ organization, isActive: true }).sort({ name: 1 })
    ]);

    const organizationDoc = await Organization.findById(organization);
    res.render('settings/index', {
      title: 'CRM settings',
      stages,
      labels,
      isPotentialLabel,
      fields,
      workTypes,
      automationRules,
      users,
      organization: organizationDoc,
      activeSection: ['appearance', 'stages', 'labels', 'fields', 'work-types', 'terminology', 'automations'].includes(req.query.section) ? req.query.section : 'stages',
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/automations', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).render('errors/403', { title: 'Access denied' });
    const organization = req.user.organization._id, clientCompany = req.activeCompany._id;
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
      if (!workType || !trigger || !action || !validCondition || !validStatus(status) || (action === 'assign_user' && !targetId) || (action === 'set_priority' && !['low', 'medium', 'high'].includes(actionValue)) || (action === 'set_status' && (!actionValue || !validStatus(actionValue))) || (action === 'set_field' && (!field || !validFieldValue))) return res.redirect('/settings?section=automations&error=Choose+valid+module+automation+options.');
      if (targetId && !await User.exists({ _id: targetId, organization, isActive: true })) return res.redirect('/settings?section=automations&error=Invalid+team+member.');
      await AutomationRule.create({ organization, clientCompany, entityType, workType: workType._id, name: String(req.body.name || '').trim() || 'Automation rule', trigger, status, conditionField, conditionValue: String(req.body.conditionValue || '').trim(), action, targetId, actionField, actionValue });
      return res.redirect('/settings?section=automations&success=Module+automation+created.');
    }
    const trigger = ['lead_created', 'stage_changed', 'owner_changed'].includes(req.body.trigger) ? req.body.trigger : '';
    const action = ['assign_user', 'add_label', 'remove_label', 'set_priority', 'create_record'].includes(req.body.action) ? req.body.action : '';
    const targetId = action === 'assign_user' ? req.body.targetUserId : ['add_label', 'remove_label'].includes(action) ? req.body.targetLabelId : action === 'create_record' ? req.body.targetWorkTypeId : null;
    const actionValue = action === 'set_priority' ? req.body.priority : '';
    const conditionField = ['source', 'priority'].includes(req.body.conditionField) ? req.body.conditionField : '';
    const conditionValue = conditionField ? String(req.body.conditionValue || '').trim() : '';
    if (!trigger || !action || ((['assign_user', 'add_label', 'remove_label', 'create_record'].includes(action) && !targetId) || (action === 'set_priority' && !['low', 'medium', 'high'].includes(actionValue)))) return res.redirect('/settings?section=automations&error=Choose+a+valid+trigger+and+action.');
    if (req.body.stage && !await CrmStage.exists({ _id: req.body.stage, organization, clientCompany })) return res.redirect('/settings?section=automations&error=Invalid+stage.');
    if (targetId) {
      const targetModel = action === 'assign_user' ? User : action === 'create_record' ? WorkType : CrmLabel;
      if (!await targetModel.exists({ _id: targetId, organization, ...(action === 'assign_user' ? {} : { clientCompany }) })) return res.redirect('/settings?section=automations&error=Invalid+action+target.');
    }
    await AutomationRule.create({ organization, clientCompany, entityType, name: String(req.body.name || '').trim() || 'Automation rule', trigger, stage: req.body.stage || null, conditionField, conditionValue, action, targetId, actionValue });
    res.redirect('/settings?section=automations&success=Automation+rule+created.');
  } catch (error) { next(error); }
});

router.post('/automations/:id/delete', async (req, res, next) => {
  try { await AutomationRule.deleteOne({ _id: req.params.id, organization: req.user.organization._id, clientCompany: req.activeCompany._id }); res.redirect('/settings?section=automations&success=Automation+rule+deleted.'); } catch (error) { next(error); }
});

router.post('/automations/:id/toggle', async (req, res, next) => {
  try {
    const rule = await AutomationRule.findOne({ _id: req.params.id, organization: req.user.organization._id, clientCompany: req.activeCompany._id });
    if (!rule) return res.status(404).render('errors/404', { title: 'Automation rule not found' });
    rule.isActive = !rule.isActive;
    await rule.save();
    res.redirect('/settings?section=automations&success=Automation+rule+updated.');
  } catch (error) { next(error); }
});

router.post('/terminology', async (req, res, next) => {
  try {
    const clean = value => String(value || '').trim().slice(0, 40);
    const terminology = { leadSingular: clean(req.body.leadSingular), leadPlural: clean(req.body.leadPlural), recordSingular: clean(req.body.recordSingular), recordPlural: clean(req.body.recordPlural), pipelineName: clean(req.body.pipelineName) };
    if (Object.values(terminology).some(value => !value)) return res.redirect('/settings?error=Enter+all+five+names.');
    await ClientCompany.updateOne({ _id: req.activeCompany._id, organization: req.user.organization._id }, { terminology });
    await logAudit(req, { action: 'terminology_update', entityType: 'client_company', entityId: req.activeCompany._id, entityName: req.activeCompany.name, message: 'CRM terminology updated.' });
    res.redirect('/settings?success=CRM+names+updated.');
  } catch (error) { next(error); }
});

router.post('/work-types', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).render('errors/403', { title: 'Access denied' });
    const data = workTypeParts(req.body);
    const duplicate = await WorkType.findOne({ organization: req.user.organization._id, clientCompany: req.activeCompany._id, key: data.key });
    if (duplicate) return res.redirect(settingsRedirect(`A work type with key "${data.key}" already exists.`));
    const workType = await WorkType.create({ organization: req.user.organization._id, clientCompany: req.activeCompany._id, ...data, isActive: true });
    await logAudit(req, { action: 'create', entityType: 'work_type', entityId: workType._id, entityName: workType.name, message: `Work type "${workType.name}" created.` });
    res.redirect('/settings?success=Work+type+created.');
  } catch (error) {
    if (error instanceof SyntaxError || /must be|required|unique|unsupported|dropdown|minimum|may only|module view/.test(error.message)) return res.redirect(settingsRedirect(error.message));
    next(error);
  }
});

router.post('/work-types/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).render('errors/403', { title: 'Access denied' });
    const organization = req.user.organization._id;
    const current = await WorkType.findOne({ _id: req.params.id, organization, clientCompany: req.activeCompany._id });
    if (!current) return res.status(404).render('errors/404', { title: 'Work type not found' });
    const data = workTypeParts(req.body);
    data.key = current.key; // Stable identifiers are intentionally immutable after creation.
    await validateWorkTypeChange(current, data);
    await WorkType.updateOne({ _id: current._id }, data);
    await logAudit(req, { action: 'update', entityType: 'work_type', entityId: current._id, entityName: data.name, message: `Work type "${data.name}" updated.` });
    res.redirect('/settings?success=Work+type+updated.');
  } catch (error) {
    if (error instanceof SyntaxError || /must be|required|unique|unsupported|dropdown|minimum|may only|module view|Move records|contains data|automations|used by an automation/.test(error.message)) return res.redirect(settingsRedirect(error.message));
    next(error);
  }
});

router.delete('/work-types/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).render('errors/403', { title: 'Access denied' });
    const filter = { _id: req.params.id, organization: req.user.organization._id, clientCompany: req.activeCompany._id };
    const workType = await WorkType.findOne(filter);
    if (!workType) return res.status(404).render('errors/404', { title: 'Work type not found' });

    // Permanently clean up all associated records, role permissions, and automations
    await CustomRecord.deleteMany({ organization: req.user.organization._id, workspace: req.activeCompany._id, module: workType._id });
    await CustomRole.updateMany({ organization: req.user.organization._id }, { $pull: { workTypePermissions: { workTypeId: workType._id } } });
    await AutomationRule.deleteMany({ organization: req.user.organization._id, clientCompany: req.activeCompany._id, workType: workType._id });
    await WorkType.deleteOne(filter);

    res.redirect('/settings?success=Work+type+and+all+associated+records+deleted.');
  } catch (error) { next(error); }
});

router.post('/theme', async (req, res, next) => {
  try {
    await Organization.updateOne(
      { _id: req.user.organization._id },
      {
        theme: {
          gold: req.body.gold || '#b58d00',
          teal: req.body.teal || '#0f766e',
          background: req.body.background || '#ffffff',
          surface: req.body.surface || '#ffffff',
          text: req.body.text || '#121214'
        }
      }
    );
    if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
      await logAudit(req, { action: 'theme_update', entityType: 'organization', entityId: req.user.organization._id, message: 'CRM theme updated.' });
      return res.json({ ok: true });
    }
    await logAudit(req, { action: 'theme_update', entityType: 'organization', entityId: req.user.organization._id, message: 'CRM theme updated.' });
    res.redirect('/settings');
  } catch (error) {
    next(error);
  }
});

router.post('/stages/reorder', express.json(), async (req, res, next) => {
  try {
    const orderedIds = Array.isArray(req.body.stageIds) ? req.body.stageIds : [];
    await Promise.all(orderedIds.map((stageId, index) => CrmStage.updateOne(
      { _id: stageId, organization: req.user.organization._id, clientCompany: req.activeCompany._id },
      { order: (index + 1) * 10 }
    )));
    await logAudit(req, { action: 'reorder', entityType: 'crm_stage', message: 'CRM stages reordered.', metadata: { orderedIds } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/fields/reorder', express.json(), async (req, res, next) => {
  try {
    const fieldIds = Array.isArray(req.body.fieldIds) ? req.body.fieldIds : [];
    await Promise.all(fieldIds.map((fieldId, index) => CustomField.updateOne(
      { _id: fieldId, organization: req.user.organization._id, clientCompany: req.activeCompany._id, entity: 'customer' },
      { order: (index + 1) * 10 }
    )));
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/stages', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const key = slugify(name);
    if (!name || !key) return res.redirect(settingsRedirect('Stage name is required.'));
    if (req.body.isWon === 'on' && req.body.isLost === 'on') return res.redirect(settingsRedirect('A stage cannot be both Won and Lost.'));
    const duplicate = await CrmStage.findOne({ organization, clientCompany: req.activeCompany._id, key });
    if (duplicate) {
      return res.redirect(settingsRedirect(`A stage named "${name}" already exists.`));
    }
    const isDefault = req.body.isDefault === 'on' || !await CrmStage.exists({ organization, clientCompany: req.activeCompany._id, isDefault: true });
    if (isDefault) await CrmStage.updateMany({ organization, clientCompany: req.activeCompany._id }, { isDefault: false });
    const stage = await CrmStage.create({
      organization,
      clientCompany: req.activeCompany._id,
      name,
      key,
      color: req.body.color || '#475569',
      order: Number(req.body.order || 0),
      isWon: req.body.isWon === 'on',
      isLost: req.body.isLost === 'on',
      isDefault
    });
    await logAudit(req, { action: 'create', entityType: 'crm_stage', entityId: stage._id, entityName: stage.name, message: `Stage "${stage.name}" created.` });
    res.redirect('/settings');
  } catch (error) {
    next(error);
  }
});

router.post('/stages/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const key = slugify(name);
    if (!name || !key) return res.redirect(settingsRedirect('Stage name is required.'));
    if (req.body.isWon === 'on' && req.body.isLost === 'on') return res.redirect(settingsRedirect('A stage cannot be both Won and Lost.'));
    const duplicate = await CrmStage.findOne({ organization, clientCompany: req.activeCompany._id, key, _id: { $ne: req.params.id } });
    if (duplicate) {
      return res.redirect(settingsRedirect(`A stage named "${name}" already exists.`));
    }

    const stage = await CrmStage.findOne({ _id: req.params.id, organization, clientCompany: req.activeCompany._id });
    if (!stage) return res.status(404).render('errors/404', { title: 'Stage not found' });

    const shouldDeactivate = stage.isActive && req.body.isActive !== 'on';
    const isDefault = req.body.isDefault === 'on';
    if (stage.isDefault && !isDefault) return res.redirect(settingsRedirect('Choose another default stage before removing this default.'));
    if (isDefault && shouldDeactivate) return res.redirect(settingsRedirect('The default stage must remain active.'));
    if (shouldDeactivate) {
      const leadsInStage = await Customer.countDocuments({ organization, clientCompany: req.activeCompany._id, stage: stage._id });
      if (leadsInStage > 0) {
        return res.redirect(settingsRedirect(`Move ${leadsInStage} lead${leadsInStage === 1 ? '' : 's'} out of "${stage.name}" before deactivating it.`));
      }
    }

    if (isDefault) await CrmStage.updateMany({ organization, clientCompany: req.activeCompany._id, _id: { $ne: stage._id } }, { isDefault: false });
    await CrmStage.updateOne(
      { _id: req.params.id, organization, clientCompany: req.activeCompany._id },
      {
        name,
        key,
        color: req.body.color || '#475569',
        order: Number(req.body.order || 0),
        isWon: req.body.isWon === 'on',
        isLost: req.body.isLost === 'on',
        isDefault,
        isActive: req.body.isActive === 'on'
      }
    );
    await logAudit(req, { action: 'update', entityType: 'crm_stage', entityId: req.params.id, entityName: name, message: `Stage "${name}" updated.` });
    res.redirect('/settings');
  } catch (error) {
    next(error);
  }
});

router.post('/labels', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const duplicate = await CrmLabel.findOne({
      organization,
      clientCompany: req.activeCompany._id,
      name: new RegExp(`^${escapeRegex(name)}$`, 'i')
    });
    if (duplicate) {
      return res.redirect(settingsRedirect(`A label named "${name}" already exists.`));
    }
    const label = await CrmLabel.create({
      organization,
      clientCompany: req.activeCompany._id,
      name,
      isHighPotential: req.body.isHighPotential === 'on',
      color: req.body.color || '#2563eb'
    });
    await logAudit(req, { action: 'create', entityType: 'crm_label', entityId: label._id, entityName: label.name, message: `Label "${label.name}" created.` });
    res.redirect('/settings');
  } catch (error) {
    next(error);
  }
});

router.post('/labels/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const duplicate = await CrmLabel.findOne({
      organization,
      clientCompany: req.activeCompany._id,
      _id: { $ne: req.params.id },
      name: new RegExp(`^${escapeRegex(name)}$`, 'i')
    });
    if (duplicate) {
      return res.redirect(settingsRedirect(`A label named "${name}" already exists.`));
    }
    await CrmLabel.updateOne(
      { _id: req.params.id, organization, clientCompany: req.activeCompany._id },
      {
        name,
        isHighPotential: req.body.isHighPotential === 'on',
        color: req.body.color || '#2563eb',
        isActive: req.body.isActive === 'on'
      }
    );
    await logAudit(req, { action: 'update', entityType: 'crm_label', entityId: req.params.id, entityName: name, message: `Label "${name}" updated.` });
    res.redirect('/settings');
  } catch (error) {
    next(error);
  }
});

router.post('/fields', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const label = String(req.body.label || '').trim();
    const key = slugify(label);
    const type = ['text', 'number', 'date', 'select', 'checkbox'].includes(req.body.type) ? req.body.type : 'text';
    const entity = 'customer';
    const duplicate = await CustomField.findOne({
      organization,
      clientCompany: req.activeCompany._id,
      entity,
      $or: [
        { key },
        { label: new RegExp(`^${escapeRegex(label)}$`, 'i') }
      ]
    });
    if (duplicate) {
      return res.redirect(settingsRedirect(`A custom field named "${label}" already exists.`));
    }
    const field = await CustomField.create({
      organization,
      clientCompany: req.activeCompany._id,
      entity,
      label,
      key,
      type,
      options: String(req.body.options || '').split(',').map(item => item.trim()).filter(Boolean),
      required: req.body.required === 'on',
      order: Number(req.body.order || 0)
    });
    await logAudit(req, { action: 'create', entityType: 'custom_field', entityId: field._id, entityName: field.label, message: `Custom field "${field.label}" created.` });
    res.redirect('/settings');
  } catch (error) {
    next(error);
  }
});

router.post('/fields/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const label = String(req.body.label || '').trim();
    const type = ['text', 'number', 'date', 'select', 'checkbox'].includes(req.body.type) ? req.body.type : 'text';
    const entity = 'customer';
    const duplicate = await CustomField.findOne({
      organization,
      clientCompany: req.activeCompany._id,
      entity,
      _id: { $ne: req.params.id },
      label: new RegExp(`^${escapeRegex(label)}$`, 'i')
    });
    if (duplicate) {
      return res.redirect(settingsRedirect(`A custom field named "${label}" already exists.`));
    }
    await CustomField.updateOne(
      { _id: req.params.id, organization, clientCompany: req.activeCompany._id },
      {
        label,
        type,
        options: String(req.body.options || '').split(',').map(item => item.trim()).filter(Boolean),
        required: req.body.required === 'on',
        order: Number(req.body.order || 0),
        isActive: req.body.isActive === 'on'
      }
    );
    await logAudit(req, { action: 'update', entityType: 'custom_field', entityId: req.params.id, entityName: label, message: `Custom field "${label}" updated.` });
    res.redirect('/settings');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
