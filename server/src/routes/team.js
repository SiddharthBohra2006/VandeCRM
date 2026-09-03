const express = require('express');

const ClientCompany = require('../models/ClientCompany');
const User = require('../models/User');
const CustomRole = require('../models/CustomRole');
const WorkType = require('../models/WorkType');
const CustomField = require('../models/CustomField');
const { requirePermission } = require('../middleware/auth');
const { hashPassword } = require('../services/passwords');
const { parseCsv, rowsToObjects, toCsv } = require('../utils/csv');
const { logAudit } = require('../utils/audit');
const { ALL_PERMISSIONS, PERMISSION_ACTIONS, PERMISSION_MODULES, ROLE_DEFINITIONS, WORK_FIELD_GROUPS, WORK_FIELDS, canAssignRole, canManageUser } = require('../config/roles');

const router = express.Router();

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

router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'view' : (['/', '/import', '/roles/create'].includes(req.path) ? 'create' : (req.path.startsWith('/roles/') && req.path.endsWith('/delete') ? 'delete' : 'update'));
  return requirePermission(`team.${action}`)(req, res, next);
});

function normalizeAssignedCompanies(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function leadFieldPermissions(body, fields) {
  const allowed = new Set(fields.map(field => field.key));
  const editable = normalizeAssignedCompanies(body.leadEditable).filter(key => allowed.has(key));
  const visible = normalizeAssignedCompanies(body.leadVisible).filter(key => allowed.has(key));
  return { configured: body.leadFieldsConfigured === 'on', visible: [...new Set([...visible, ...editable])], editable };
}

function normalizeModules(value) {
  return normalizeAssignedCompanies(value);
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

function normalizeImportedRole(value) {
  const label = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const directRole = roleOptions.find(role => role.replaceAll('_', ' ') === label || ROLE_DEFINITIONS[role].label.toLowerCase() === label);
  const alias = Object.entries(roleAliases).find(([name]) => label === name || label.startsWith(`${name}/`) || label.startsWith(`${name} /`));
  return directRole || alias?.[1] || 'agent';
}

router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const [allUsers, companies, customRoles, workTypes, leadFields] = await Promise.all([
      User.find({ organization }).populate('customRole').sort({ role: 1, name: 1 }),
      ClientCompany.find({ organization }).populate('assignedUsers').sort({ name: 1 }),
      CustomRole.find({ organization }).sort({ name: 1 }),
      WorkType.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ order: 1, name: 1 }),
      CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 })
    ]);
    const teamFilters = { q: String(req.query.q || '').trim(), status: String(req.query.status || ''), role: String(req.query.role || '') };
    const query = teamFilters.q.toLowerCase();
    const users = allUsers.filter(member => {
      const matchesQuery = !query || [member.name, member.email, member.customRole?.name, ROLE_DEFINITIONS[member.role]?.label].some(value => String(value || '').toLowerCase().includes(query));
      const matchesStatus = !teamFilters.status || (teamFilters.status === 'active' ? member.isActive !== false : member.isActive === false);
      const matchesRole = !teamFilters.role || (teamFilters.role.startsWith('custom:') ? String(member.customRole?._id || '') === teamFilters.role.slice(7) : member.role === teamFilters.role);
      return matchesQuery && matchesStatus && matchesRole;
    });

    res.render('team/index', {
      title: 'Team Management',
      users,
      teamFilters,
      teamSummary: { total: allUsers.length, active: allUsers.filter(member => member.isActive !== false).length, inactive: allUsers.filter(member => member.isActive === false).length },
      companies,
      roleDefinitions: ROLE_DEFINITIONS,
      customRoles,
      permissionModules: PERMISSION_MODULES.filter(module => module !== 'tasks'),
      permissionActions: PERMISSION_ACTIONS,
      permissionModuleLabels: PERMISSION_MODULES,
      permissionModuleNames: { businesses: 'Leads, pipeline, and follow-ups', videos: 'Videos', designs: 'Designs', websites: 'Websites', content: 'Content', ads: 'Campaigns and ads', targets: 'Targets', reports: 'Reports', mail: 'Mail', integrations: 'Integrations', settings: 'CRM customization', audit: 'Activity history', team: 'Team management' },
      workFieldGroups: WORK_FIELD_GROUPS,
      workTypes,
      leadFields,
      activeTab: req.query.tab === 'roles' ? 'roles' : 'members',
      error: req.query.error || '',
      success: req.query.success || '',
      importResult: req.query.imported !== undefined ? {
        created: Number(req.query.imported || 0),
        updated: Number(req.query.updated || 0),
        skipped: Number(req.query.skipped || 0)
      } : null
    });
  } catch (error) {
    next(error);
  }
});

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

router.post('/import', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const csvText = String(req.body.csvData || '').trim();
    if (!csvText) {
      return res.redirect('/team?error=Please select or paste a CSV file before importing.');
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
    res.redirect(`/team?imported=${created}&updated=${updated}&skipped=${skipped}`);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const requestedRole = roleOptions.includes(req.body.role) ? req.body.role : 'agent';
    const role = canAssignRole(req.user, requestedRole) ? requestedRole : 'agent';
    const assignedCompanies = normalizeAssignedCompanies(req.body.assignedCompanies);
    const customRole = req.body.customRole ? await CustomRole.findOne({ _id: req.body.customRole, organization }) : null;

    if (!name || !email || password.length < 8) {
      return res.redirect('/team?error=Name, email, and an 8 character password are required.');
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.redirect('/team?error=A user with this email already exists.');
    }

    const user = await User.create({
      organization,
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      customRole: customRole ? customRole._id : null,
      hiddenModules: normalizeModules(req.body.hiddenModules),
      isActive: req.body.isActive !== 'off'
    });

    if (assignedCompanies.length) {
      await ClientCompany.updateMany(
        { _id: { $in: assignedCompanies }, organization },
        { $addToSet: { assignedUsers: user._id } }
      );
    }
    await logAudit(req, {
      action: 'create',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      message: `Team member "${user.name}" created with role ${user.role}.`
    });

    res.redirect('/team?success=Team member created.');
  } catch (error) {
    next(error);
  }
});

router.post('/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const user = await User.findOne({ _id: req.params.id, organization });
    if (!user) return res.status(404).render('errors/404', { title: 'User not found' });
    if (!canManageUser(req.user, user)) return res.status(403).render('errors/403', { title: 'Access denied' });

    const requestedRole = roleOptions.includes(req.body.role) ? req.body.role : user.role;
    const role = canAssignRole(req.user, requestedRole) ? requestedRole : user.role;
    const isSelf = String(user._id) === String(req.user._id);
    const assignedCompanies = normalizeAssignedCompanies(req.body.assignedCompanies);
    const customRole = req.body.customRole ? await CustomRole.findOne({ _id: req.body.customRole, organization }) : null;

    user.name = String(req.body.name || '').trim() || user.name;
    if (!isSelf) user.role = role;
    if (!isSelf) user.customRole = customRole ? customRole._id : null;
    if (!isSelf) user.hiddenModules = normalizeModules(req.body.hiddenModules);
    if (isSelf) user.isActive = true;

    const newPassword = String(req.body.password || '');
    if (newPassword) {
      if (newPassword.length < 8) {
        return res.redirect('/team?error=New passwords must be at least 8 characters.');
      }
      user.passwordHash = await hashPassword(newPassword);
    }

    await user.save();

    await ClientCompany.updateMany(
      { organization },
      { $pull: { assignedUsers: user._id } }
    );
    if (assignedCompanies.length) {
      await ClientCompany.updateMany(
        { _id: { $in: assignedCompanies }, organization },
        { $addToSet: { assignedUsers: user._id } }
      );
    }
    await logAudit(req, {
      action: 'update',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      message: `Team member "${user.name}" updated.`,
      metadata: { role: user.role, isActive: user.isActive }
    });

    res.redirect('/team?success=Team member updated.');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/status', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const user = await User.findOne({ _id: req.params.id, organization });
    if (!user) return res.status(404).render('errors/404', { title: 'User not found' });
    if (String(user._id) === String(req.user._id)) {
      return res.redirect('/team?error=You cannot deactivate your own account.');
    }
    if (!canManageUser(req.user, user)) return res.status(403).render('errors/403', { title: 'Access denied' });

    user.isActive = req.body.isActive === 'true';
    await user.save();
    await logAudit(req, {
      action: 'update',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      message: `Team member "${user.name}" ${user.isActive ? 'reactivated' : 'deactivated'}.`,
      metadata: { isActive: user.isActive }
    });
    res.redirect(`/team?success=Team member ${user.isActive ? 'reactivated' : 'deactivated'}.`);
  } catch (error) {
    next(error);
  }
});

router.post('/roles/create', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const permissions = normalizeAssignedCompanies(req.body.permissions).filter(permission => ALL_PERMISSIONS.includes(permission));
    if (!name) return res.redirect('/team?tab=roles&error=Role name is required.');
    const fieldPermissions = Object.fromEntries(Object.keys(WORK_FIELDS).map(type => [type, normalizeAssignedCompanies(req.body.fieldPermissions?.[type]).filter(field => WORK_FIELDS[type].includes(field))]));
    const [workTypes, leadFields] = await Promise.all([WorkType.find({ organization, clientCompany: req.activeCompany._id }), CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer', isActive: true })]);
    const workTypePermissions = workTypes.map(workType => ({
      workTypeId: workType._id,
      actions: normalizeAssignedCompanies(req.body.workActions?.[String(workType._id)]).filter(action => PERMISSION_ACTIONS.includes(action)),
      editableFieldKeys: normalizeAssignedCompanies(req.body.editableFields?.[String(workType._id)]).filter(key => ['title', 'clientCompany', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes', ...workType.fields.map(field => field.key)].includes(key))
    })).filter(permission => permission.actions.length);
    await CustomRole.create({ organization, name, permissions, scope: req.body.scope === 'organization' ? 'organization' : 'assigned', leadFieldPermissions: leadFieldPermissions(req.body, leadFields), fieldPermissions, workTypePermissions });
    res.redirect('/team?tab=roles&success=Custom role created.');
  } catch (error) {
    if (error.code === 11000) return res.redirect('/team?tab=roles&error=A role with this name already exists.');
    next(error);
  }
});

router.post('/roles/:id', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const permissions = normalizeAssignedCompanies(req.body.permissions).filter(permission => ALL_PERMISSIONS.includes(permission));
    const fieldPermissions = Object.fromEntries(Object.keys(WORK_FIELDS).map(type => [type, normalizeAssignedCompanies(req.body.fieldPermissions?.[type]).filter(field => WORK_FIELDS[type].includes(field))]));
    const [workTypes, leadFields] = await Promise.all([WorkType.find({ organization, clientCompany: req.activeCompany._id }), CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer', isActive: true })]);
    const currentRole = await CustomRole.findOne({ _id: req.params.id, organization });
    if (!currentRole) return res.status(404).render('errors/404', { title: 'Role not found' });
    const activeIds = new Set(workTypes.map(workType => String(workType._id)));
    const workTypePermissions = [...currentRole.workTypePermissions.filter(permission => !activeIds.has(String(permission.workTypeId))), ...workTypes.map(workType => ({
      workTypeId: workType._id,
      actions: normalizeAssignedCompanies(req.body.workActions?.[String(workType._id)]).filter(action => PERMISSION_ACTIONS.includes(action)),
      editableFieldKeys: normalizeAssignedCompanies(req.body.editableFields?.[String(workType._id)]).filter(key => ['title', 'clientCompany', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes', ...workType.fields.map(field => field.key)].includes(key))
    })).filter(permission => permission.actions.length)];
    await CustomRole.updateOne({ _id: req.params.id, organization }, { name: String(req.body.name || '').trim(), permissions, scope: req.body.scope === 'organization' ? 'organization' : 'assigned', leadFieldPermissions: leadFieldPermissions(req.body, leadFields), fieldPermissions, workTypePermissions });
    res.redirect('/team?tab=roles&success=Custom role updated.');
  } catch (error) { next(error); }
});

router.post('/roles/:id/delete', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const role = await CustomRole.findOne({ _id: req.params.id, organization });
    if (!role) return res.status(404).render('errors/404', { title: 'Role not found' });

    // ponytail: clear user references to this customRole gracefully
    await CustomRole.deleteOne({ _id: role._id, organization });
    await User.updateMany(
      { customRole: role._id, organization },
      { $set: { customRole: null } }
    );
    await logAudit(req, {
      action: 'delete',
      entityType: 'custom_role',
      entityId: role._id,
      entityName: role.name,
      message: `Custom role "${role.name}" deleted.`
    });
    res.redirect('/team?tab=roles&success=Custom role deleted.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
