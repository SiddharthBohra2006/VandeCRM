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
const { slugify } = require('../utils/slug');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(requireApiAuth);

function workspace(req, res) {
  if (req.activeCompanyId) return String(req.activeCompanyId);
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

// GET /api/settings — Settings overview data
router.get('/', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    const [stages, labels, fields, workTypes, automations, orgDoc, companyDoc] = await Promise.all([
      CrmStage.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ order: 1, createdAt: 1 }).lean(),
      CrmLabel.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ name: 1 }).lean(),
      CustomField.find({ organization, clientCompany: activeWorkspace, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }).lean(),
      WorkType.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ order: 1, name: 1 }).lean(),
      AutomationRule.find({ organization, clientCompany: activeWorkspace }).sort({ createdAt: -1 }).lean(),
      Organization.findById(organization).lean(),
      ClientCompany.findById(activeWorkspace).lean(),
    ]);

    res.json({
      ok: true,
      stages,
      labels,
      fields,
      workTypes,
      automations,
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
    const { name, color, isWon, isLost, isDefault, order } = req.body;

    const stage = await CrmStage.findOne({ _id: req.params.id, organization, clientCompany: activeWorkspace });
    if (!stage) {
      return res.status(404).json({ ok: false, error: 'Stage not found.' });
    }

    if (name) stage.name = String(name).trim();
    if (color) stage.color = color;
    if (isWon !== undefined) stage.isWon = Boolean(isWon);
    if (isLost !== undefined) stage.isLost = Boolean(isLost);
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
    const { label, options, required, order } = req.body;

    const field = await CustomField.findOne({ _id: req.params.id, organization, clientCompany: activeWorkspace });
    if (!field) {
      return res.status(404).json({ ok: false, error: 'Field not found.' });
    }

    if (label) field.label = String(label).trim();
    if (options !== undefined) field.options = Array.isArray(options) ? options : [];
    if (required !== undefined) field.required = Boolean(required);
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
    const { name, color } = req.body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ ok: false, error: 'Label name is required.' });
    }

    const label = await CrmLabel.create({
      organization,
      clientCompany: activeWorkspace,
      name: trimmedName,
      color: color || '#64748b',
      isActive: true,
    });

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

module.exports = router;
