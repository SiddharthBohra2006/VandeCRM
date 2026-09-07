const User = require('../models/User');
const ClientCompany = require('../models/ClientCompany');
const { hasWorkPermission } = require('../config/roles');

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

module.exports = { assignableWorkUsers };
