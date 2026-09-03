const express = require('express');
const { requireApiAuth } = require('./middleware/auth');
const User = require('../models/User');
const ClientCompany = require('../models/ClientCompany');
const CustomRole = require('../models/CustomRole');
const WorkType = require('../models/WorkType');
const CustomField = require('../models/CustomField');
const { hashPassword } = require('../services/passwords');
const { logAudit } = require('../utils/audit');
const {
  ROLE_DEFINITIONS,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  WORK_FIELD_GROUPS,
  canAssignRole,
  canManageUser,
} = require('../config/roles');

const router = express.Router();
router.use(requireApiAuth);

const roleOptions = Object.keys(ROLE_DEFINITIONS);

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

// DELETE /api/team/:id — Delete team member
router.delete('/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ ok: false, error: 'You cannot delete your own account.' });
    }

    const user = await User.findOne({ _id: req.params.id, organization });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Team member not found.' });
    }

    if (!canManageUser(req.user, user)) {
      return res.status(403).json({ ok: false, error: 'Permission denied to delete this user.' });
    }

    await ClientCompany.updateMany({ organization }, { $pull: { assignedUsers: user._id } });
    await User.deleteOne({ _id: user._id, organization });

    await logAudit(req, {
      action: 'delete',
      entityType: 'user',
      entityId: req.params.id,
      entityName: user.name,
      message: `Team member "${user.name}" removed.`,
    });

    res.json({ ok: true });
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
    const { name, permissions, scope } = req.body;

    if (!String(name || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Role name is required.' });
    }

    const role = await CustomRole.create({
      organization,
      name: String(name).trim(),
      permissions: normalizeArray(permissions),
      scope: scope || 'organization',
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

    const { name, permissions, scope } = req.body;
    if (name) role.name = String(name).trim();
    if (permissions !== undefined) role.permissions = normalizeArray(permissions);
    if (scope) role.scope = scope;

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
