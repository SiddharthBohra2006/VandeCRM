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
  return users.filter(user => hasWorkPermission(user, workType, 'view'));
}

module.exports = { assignableWorkUsers };
