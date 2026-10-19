const User = require('../models/User');
const ClientCompany = require('../models/ClientCompany');
const mongoose = require('mongoose');
const { hasWorkPermission, ROLE_DEFINITIONS } = require('../config/roles');

async function assignableWorkUsers(organization, workspace, workType) {
  const company = await ClientCompany.findOne({ _id: workspace, organization }).select('assignedUsers');
  if (!company) return [];
  const users = await User.find({
    organization, isActive: true, role: { $ne: 'client' },
    $or: [{ role: { $in: ['admin', 'manager'] } }, { _id: { $in: company.assignedUsers || [] } }]
  }).populate('customRole').sort({ name: 1 });
  // Evaluate permission on the full user record first (customRole/hiddenModules
  // are needed by hasWorkPermission), then project to a minimal payload so
  // emails, login stats and raw role permissions never reach the client.
  return users
    .filter(user => hasWorkPermission(user, workType, 'view'))
    .map(user => ({ _id: user._id, name: user.name, email: user.email }));
}

async function explainIneligibleWorkUser(organization, workspace, workType, userId) {
  if (!userId) return 'Choose a team member to assign this work to.';
  if (!mongoose.isObjectIdOrHexString(userId)) return 'That team member selection is invalid. Refresh the page and choose a team member again.';
  const user = await User.findOne({ _id: userId, organization }).populate('customRole').select('name role customRole isActive');
  if (!user) return 'This person is not an active member of your organization.';
  if (!user.isActive) return `${user.name} is inactive. Reactivate their account before assigning work.`;

  const company = await ClientCompany.findOne({ _id: workspace, organization }).select('name assignedUsers');
  if (!company || !(company.assignedUsers || []).some(id => String(id) === String(user._id))) {
    return `${user.name} is not assigned to the ${company?.name || 'current'} workspace. Add them to that workspace in Team or CRM settings first.`;
  }

  if (!hasWorkPermission(user, workType, 'view')) {
    const roleName = user.customRole?.name || ROLE_DEFINITIONS[user.role]?.label || user.role;
    return `${user.name} has the ${roleName} role, which does not include access to ${workType.name}. Update their role in Team → Roles & Permissions to grant ${workType.name} access.`;
  }

  return `${user.name} is eligible for ${workType.name}. Refresh the page and try again.`;
}

module.exports = { assignableWorkUsers, explainIneligibleWorkUser };
