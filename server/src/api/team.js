const express = require('express');
const { requireApiAuth } = require('./middleware/auth');
const User = require('../models/User');
const ClientCompany = require('../models/ClientCompany');
const CustomRole = require('../models/CustomRole');
const WorkType = require('../models/WorkType');
const CustomField = require('../models/CustomField');
const { hashPassword } = require('../services/passwords');
const { parseCsv, rowsToObjects, toCsv } = require('../utils/csv');
const { logAudit } = require('../utils/audit');
const {
  ROLE_DEFINITIONS,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  WORK_FIELD_GROUPS,
  canAssignRole,
  canManageUser,
} = require('../config/roles');

const roleOptions = Object.keys(ROLE_DEFINITIONS);
const roleAliases = {
  editing: 'video_editor',
  'web dev': 'website_developer',
  'content distribution': 'content_manager',
  'content team': 'content_manager',
  posting: 'content_manager',
  'script / comment': 'content_manager',
  ads: 'ads_manager',
  graphics: 'graphic_designer'
};
const customRoleTemplates = {
  sales: { permissions: ['businesses.view', 'businesses.create', 'businesses.update', 'tasks.view', 'tasks.create', 'tasks.update'], scope: 'assigned' },
  basic: { permissions: ['businesses.view', 'businesses.update', 'tasks.view', 'tasks.update'], scope: 'assigned' },
  video_editor: { permissions: ['videos.view', 'videos.update'], scope: 'assigned' },
  team_view: { permissions: ['team.view'], scope: 'organization' }
};

function normalizeImportedRole(value) {
  const label = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const directRole = roleOptions.find(role => role.replaceAll('_', ' ') === label || ROLE_DEFINITIONS[role].label.toLowerCase() === label);
  const alias = Object.entries(roleAliases).find(([name]) => label === name || label.startsWith(`${name}/`) || label.startsWith(`${name} /`));
  return directRole || alias?.[1] || 'agent';
}

function parseBoolean(value, defaultValue = true) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return defaultValue;
  return ['true', 'yes', '1', 'active', 'on'].includes(text);
}

function splitCompanyNames(value) {
  return String(value || '')
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
}

const router = express.Router();
router.use(requireApiAuth);
const apiPermission = require('./middleware/permission');
router.use((req, res, next) => {
  const action = ['GET', 'HEAD'].includes(req.method) ? 'view'
    : req.method === 'DELETE' ? 'delete'
    : req.method === 'POST' && ['/', '/import', '/roles'].includes(req.path) ? 'create' : 'update';
  return apiPermission('team.' + action)(req, res, next);
});

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

// GET /api/team — Team members list & metadata
router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const activeWorkspace = req.activeCompanyId ? String(req.activeCompanyId) : null;

    const [allUsers, companies, customRoles, workTypes, leadFields] = await Promise.all([
      User.find({ organization }).populate('customRole').sort({ role: 1, name: 1 }).lean(),
      ClientCompany.find({ organization }).populate('assignedUsers').sort({ name: 1 }).lean(),
      CustomRole.find({ organization }).sort({ name: 1 }).lean(),
      activeWorkspace
        ? WorkType.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ order: 1, name: 1 }).lean()
        : [],
      activeWorkspace
        ? CustomField.find({ organization, clientCompany: activeWorkspace, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }).lean()
        : [],
    ]);

    const { q, status, role } = req.query;
    const query = String(q || '').toLowerCase().trim();

    const users = allUsers.filter(member => {
      const matchesQuery =
        !query ||
        [member.name, member.email, member.customRole?.name, ROLE_DEFINITIONS[member.role]?.label].some(v =>
          String(v || '').toLowerCase().includes(query)
        );
      const matchesStatus =
        !status || (status === 'active' ? member.isActive !== false : member.isActive === false);
      const matchesRole =
        !role ||
        (role.startsWith('custom:')
          ? String(member.customRole?._id || '') === role.slice(7)
          : member.role === role);
      return matchesQuery && matchesStatus && matchesRole;
    });

    res.json({
      ok: true,
      users,
      teamSummary: {
        total: allUsers.length,
        active: allUsers.filter(m => m.isActive !== false).length,
        inactive: allUsers.filter(m => m.isActive === false).length,
      },
      companies,
      roleDefinitions: ROLE_DEFINITIONS,
      customRoles,
      permissionModules: PERMISSION_MODULES.filter(m => m !== 'tasks'),
      permissionActions: PERMISSION_ACTIONS,
      workFieldGroups: WORK_FIELD_GROUPS,
      workTypes,
      leadFields,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/team — Create team member
router.post('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { name, email, password, role: requestedRole, customRole: customRoleId, assignedCompanies, hiddenModules, isActive } = req.body;

    const trimmedName = String(name || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const rawPassword = String(password || '');

    if (!trimmedName || !trimmedEmail || rawPassword.length < 8) {
      return res.status(400).json({ ok: false, error: 'Name, email, and an 8+ character password are required.' });
    }

    const existing = await User.findOne({ email: trimmedEmail });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'A user with this email already exists.' });
    }

    const role = canAssignRole(req.user, requestedRole) ? requestedRole : 'agent';
    const customRole = customRoleId ? await CustomRole.findOne({ _id: customRoleId, organization }) : null;

    const passwordHash = await hashPassword(rawPassword);
    const user = await User.create({
      organization,
      name: trimmedName,
      email: trimmedEmail,
      passwordHash,
      role,
      customRole: customRole ? customRole._id : null,
      hiddenModules: normalizeArray(hiddenModules),
      isActive: isActive !== false,
    });

    const companiesToAssign = normalizeArray(assignedCompanies);
    if (companiesToAssign.length) {
      await ClientCompany.updateMany(
        { _id: { $in: companiesToAssign }, organization },
        { $addToSet: { assignedUsers: user._id } }
      );
    }

    await logAudit(req, {
      action: 'create',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      message: `Team member "${user.name}" created with role ${user.role}.`,
    });

    const populated = await User.findById(user._id).populate('customRole').lean();
    res.json({ ok: true, data: populated });
  } catch (error) {
    next(error);
  }
});

// PUT /api/team/:id — Update team member
router.put('/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const user = await User.findOne({ _id: req.params.id, organization });

    if (!user) {
      return res.status(404).json({ ok: false, error: 'Team member not found.' });
    }

    if (!canManageUser(req.user, user)) {
      return res.status(403).json({ ok: false, error: 'Permission denied to edit this user.' });
    }

    const { name, role: requestedRole, customRole: customRoleId, password, isActive, assignedCompanies, hiddenModules } = req.body;
    const isSelf = String(user._id) === String(req.user._id);

    if (name) user.name = String(name).trim();

    if (!isSelf && requestedRole && canAssignRole(req.user, requestedRole)) {
      user.role = requestedRole;
    }

    if (!isSelf && customRoleId !== undefined) {
      if (customRoleId) {
        const cRole = await CustomRole.findOne({ _id: customRoleId, organization });
        user.customRole = cRole ? cRole._id : null;
      } else {
        user.customRole = null;
      }
    }

    if (!isSelf && isActive !== undefined) {
      user.isActive = Boolean(isActive);
    }

    if (password && String(password).length >= 8) {
      user.passwordHash = await hashPassword(String(password));
    }

    if (hiddenModules !== undefined) {
      user.hiddenModules = normalizeArray(hiddenModules);
    }

    await user.save();

    if (assignedCompanies !== undefined) {
      const companiesToAssign = normalizeArray(assignedCompanies);
      await ClientCompany.updateMany(
        { organization },
        { $pull: { assignedUsers: user._id } }
      );
      if (companiesToAssign.length) {
        await ClientCompany.updateMany(
          { _id: { $in: companiesToAssign }, organization },
          { $addToSet: { assignedUsers: user._id } }
        );
      }
    }

    await logAudit(req, {
      action: 'update',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      message: `Team member "${user.name}" updated.`,
    });

    const populated = await User.findById(user._id).populate('customRole').lean();
    res.json({ ok: true, data: populated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/team/:id — Deactivate team member (preserves account lifecycle & data integrity)
router.delete('/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ ok: false, error: 'You cannot deactivate your own account.' });
    }

    const user = await User.findOne({ _id: req.params.id, organization });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Team member not found.' });
    }

    if (!canManageUser(req.user, user)) {
      return res.status(403).json({ ok: false, error: 'Permission denied to manage this user.' });
    }

    if (user.role === 'admin' && user.isActive) {
      const activeAdminCount = await User.countDocuments({ organization, role: 'admin', isActive: { $ne: false } });
      if (activeAdminCount <= 1) {
        return res.status(400).json({ ok: false, error: 'Cannot deactivate the last active administrator.' });
      }
    }

    user.isActive = false;
    await user.save();
    await ClientCompany.updateMany({ organization }, { $pull: { assignedUsers: user._id } });

    await logAudit(req, {
      action: 'update',
      entityType: 'user',
      entityId: req.params.id,
      entityName: user.name,
      message: `Team member "${user.name}" deactivated.`,
    });

    res.json({ ok: true, message: `Team member "${user.name}" deactivated.` });
  } catch (error) {
    next(error);
  }
});

// POST /api/team/:id/status — Toggle active status
router.post('/:id/status', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ ok: false, error: 'You cannot change the status of your own account.' });
    }
    const user = await User.findOne({ _id: req.params.id, organization });
    if (!user) return res.status(404).json({ ok: false, error: 'Team member not found.' });
    if (!canManageUser(req.user, user)) return res.status(403).json({ ok: false, error: 'Access denied.' });

    const newIsActive = req.body.isActive === true || req.body.isActive === 'true';
    if (!newIsActive && user.role === 'admin' && user.isActive) {
      const activeAdminCount = await User.countDocuments({ organization, role: 'admin', isActive: { $ne: false } });
      if (activeAdminCount <= 1) {
        return res.status(400).json({ ok: false, error: 'Cannot deactivate the last active administrator.' });
      }
    }

    user.isActive = newIsActive;
    await user.save();
    if (!newIsActive) {
      await ClientCompany.updateMany({ organization }, { $pull: { assignedUsers: user._id } });
    }

    await logAudit(req, {
      action: 'update',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      message: `Team member "${user.name}" ${user.isActive ? 'reactivated' : 'deactivated'}.`,
    });

    res.json({ ok: true, data: user });
  } catch (error) {
    next(error);
  }
});

// GET /api/team/template.csv — Download import template
router.get('/template.csv', async (req, res, next) => {
  try {
    const headers = ['name', 'email', 'password', 'role', 'customRole', 'permissionTemplate', 'isActive', 'assignedCompanies'];
    const rows = [{
      name: 'Priya Sharma',
      email: 'priya@example.com',
      password: 'ChangeMe123',
      role: 'Agent',
      customRole: '',
      permissionTemplate: '',
      isActive: 'yes',
      assignedCompanies: 'Vande Digital Academy|Shopify Fashion Store'
    }];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="team-import-template.csv"');
    res.send(toCsv(headers, rows));
  } catch (error) {
    next(error);
  }
});

// GET /api/team/export.csv — Export all team members
router.get('/export.csv', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const [users, companies] = await Promise.all([
      User.find({ organization }).populate('customRole').sort({ role: 1, name: 1 }),
      ClientCompany.find({ organization }).populate('assignedUsers').sort({ name: 1 })
    ]);

    const headers = ['name', 'email', 'role', 'customRole', 'isActive', 'assignedCompanies', 'lastLoginAt'];
    const rows = users.map(user => {
      const assignedCompanies = companies
        .filter(company => company.assignedUsers.some(assigned => String(assigned._id) === String(user._id)))
        .map(company => company.name)
        .join('|');

      return {
        name: user.name,
        email: user.email,
        role: ROLE_DEFINITIONS[user.role]?.label || user.role,
        customRole: user.customRole?.name || '',
        isActive: user.isActive === false ? 'no' : 'yes',
        assignedCompanies,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : ''
      };
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vande-crm-team.csv"');
    res.send(toCsv(headers, rows));
  } catch (error) {
    next(error);
  }
});

// POST /api/team/import — Import team members from CSV
router.post('/import', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const csvText = String(req.body.csvData || '').trim();
    if (!csvText) {
      return res.status(400).json({ ok: false, error: 'Please provide CSV data to import.' });
    }

    const rows = rowsToObjects(parseCsv(csvText));
    const companies = await ClientCompany.find({ organization }).sort({ name: 1 });
    const companyByName = new Map(companies.map(company => [company.name.toLowerCase(), company]));
    const customRoleByName = new Map((await CustomRole.find({ organization })).map(role => [role.name.toLowerCase(), role]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = String(row.name || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const password = String(row.password || '');
      const requestedValidRole = normalizeImportedRole(row.role);
      const role = canAssignRole(req.user, requestedValidRole) ? requestedValidRole : 'agent';
      const customRoleName = String(row.customRole || '').trim();
      const permissionTemplate = String(row.permissionTemplate || '').trim().toLowerCase();
      const importsCustomRole = Object.prototype.hasOwnProperty.call(row, 'customRole');
      let customRole = customRoleName ? customRoleByName.get(customRoleName.toLowerCase()) : null;
      const isActive = parseBoolean(row.isActive, true);
      const companyNames = splitCompanyNames(row.assignedCompanies);

      if (!email) {
        skipped += 1;
        continue;
      }

      const existingByEmail = await User.findOne({ email });
      if (existingByEmail && String(existingByEmail.organization) !== String(organization)) {
        skipped += 1;
        continue;
      }

      let user = existingByEmail && String(existingByEmail.organization) === String(organization) ? existingByEmail : null;
      if (!user && (!name || password.length < 8)) {
        skipped += 1;
        continue;
      }
      if (user && !canManageUser(req.user, user)) {
        skipped += 1;
        continue;
      }
      if (customRoleName && !customRole) {
        const template = customRoleTemplates[permissionTemplate];
        if (!template) {
          skipped += 1;
          continue;
        }
        customRole = await CustomRole.create({ organization, name: customRoleName, ...template });
        customRoleByName.set(customRoleName.toLowerCase(), customRole);
      }

      if (user) {
        const isSelf = String(user._id) === String(req.user._id);
        if (name) user.name = name;
        if (!isSelf) user.role = role;
        if (!isSelf && importsCustomRole) user.customRole = customRole?._id || null;
        if (!isSelf) user.isActive = isActive;
        if (password) {
          if (password.length < 8) {
            skipped += 1;
            continue;
          }
          user.passwordHash = await hashPassword(password);
        }
        await user.save();
        updated += 1;
      } else {
        user = await User.create({
          organization,
          name,
          email,
          passwordHash: await hashPassword(password),
          role,
          customRole: customRole?._id || null,
          isActive
        });
        created += 1;
      }

      const assignedCompanyIds = companyNames
        .map(companyName => companyByName.get(companyName.toLowerCase()))
        .filter(Boolean)
        .map(company => company._id);

      await ClientCompany.updateMany(
        { organization },
        { $pull: { assignedUsers: user._id } }
      );
      if (assignedCompanyIds.length) {
        await ClientCompany.updateMany(
          { _id: { $in: assignedCompanyIds }, organization },
          { $addToSet: { assignedUsers: user._id } }
        );
      }
    }

    await logAudit(req, {
      action: 'import',
      entityType: 'user',
      message: `Team CSV import completed. Created ${created}, updated ${updated}, skipped ${skipped}.`,
      metadata: { created, updated, skipped }
    });

    res.json({ ok: true, created, updated, skipped });
  } catch (error) {
    next(error);
  }
});

// GET /api/team/roles — Custom roles
router.get('/roles', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const roles = await CustomRole.find({ organization }).sort({ name: 1 }).lean();
    res.json({ ok: true, data: roles });
  } catch (error) {
    next(error);
  }
});

// POST /api/team/roles — Create custom role
router.post('/roles', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { name, permissions, scope, leadFieldPermissions, fieldPermissions, workTypePermissions } = req.body;

    if (!String(name || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Role name is required.' });
    }

    const role = await CustomRole.create({
      organization,
      name: String(name).trim(),
      permissions: normalizeArray(permissions),
      scope: scope === 'assigned' ? 'assigned' : 'organization',
      ...(leadFieldPermissions ? { leadFieldPermissions } : {}),
      ...(fieldPermissions ? { fieldPermissions } : {}),
      ...(workTypePermissions ? { workTypePermissions: normalizeArray(workTypePermissions) } : {}),
    });

    await logAudit(req, {
      action: 'create_role',
      entityType: 'custom_role',
      entityId: role._id,
      entityName: role.name,
      message: `Custom role "${role.name}" created.`,
    });

    res.json({ ok: true, data: role });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ ok: false, error: 'A role with this name already exists.' });
    next(error);
  }
});

// PUT /api/team/roles/:id — Update custom role
router.put('/roles/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const role = await CustomRole.findOne({ _id: req.params.id, organization });

    if (!role) {
      return res.status(404).json({ ok: false, error: 'Custom role not found.' });
    }

    const { name, permissions, scope, leadFieldPermissions, fieldPermissions, workTypePermissions } = req.body;
    if (name) role.name = String(name).trim();
    if (permissions !== undefined) role.permissions = normalizeArray(permissions);
    if (scope) role.scope = scope === 'assigned' ? 'assigned' : 'organization';
    if (leadFieldPermissions !== undefined) role.leadFieldPermissions = leadFieldPermissions;
    if (fieldPermissions !== undefined) role.fieldPermissions = fieldPermissions;
    if (workTypePermissions !== undefined) role.workTypePermissions = normalizeArray(workTypePermissions);

    await role.save();

    await logAudit(req, {
      action: 'update_role',
      entityType: 'custom_role',
      entityId: role._id,
      entityName: role.name,
      message: `Custom role "${role.name}" updated.`,
    });

    res.json({ ok: true, data: role });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ ok: false, error: 'A role with this name already exists.' });
    next(error);
  }
});

// DELETE /api/team/roles/:id — Delete custom role
router.delete('/roles/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const role = await CustomRole.findOne({ _id: req.params.id, organization });

    if (!role) {
      return res.status(404).json({ ok: false, error: 'Custom role not found.' });
    }

    // Unlink role from users
    await User.updateMany({ organization, customRole: role._id }, { $set: { customRole: null } });
    await CustomRole.deleteOne({ _id: role._id, organization });

    await logAudit(req, {
      action: 'delete_role',
      entityType: 'custom_role',
      entityId: role._id,
      entityName: role.name,
      message: `Custom role "${role.name}" deleted.`,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
