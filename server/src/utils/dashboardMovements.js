function movementAuditFilter(organization, workItems, campaigns) {
  const byType = new Map();
  for (const item of workItems) {
    if (!item.workType?.key) continue;
    if (!byType.has(item.workType.key)) byType.set(item.workType.key, []);
    byType.get(item.workType.key).push(item._id);
  }
  const scopes = [...byType].map(([entityType, ids]) => ({ entityType, entityId: { $in: ids } }));
  if (campaigns.length) scopes.push({ entityType: 'campaign', entityId: { $in: campaigns.map(item => item._id) } });
  return scopes.length ? { organization, $or: scopes } : null;
}

function dashboardMovements(activities, audits, workTypes) {
  const names = new Map(workTypes.map(type => [type.key, type.name]));
  return [
    ...activities.map(item => ({
      id: `activity-${item._id}`, actor: item.user?.name || 'System',
      title: item.customer?.name || 'Lead activity', message: item.note,
      category: 'Leads', group: 'leads', action: item.type === 'stage_changed' ? 'moved a lead' : 'logged an update', icon: 'users', createdAt: item.createdAt,
      href: item.customer?._id ? `/customers/${item.customer._id}` : ''
    })),
    ...audits.map(item => ({
      id: `audit-${item._id}`, actor: item.user?.name || 'System',
      title: item.entityName || names.get(item.entityType) || 'Campaign', message: item.message,
      category: names.get(item.entityType) || 'Campaigns',
      group: item.entityType === 'campaign' ? 'campaigns' : 'work',
      action: ({ work_create: 'created work', work_update: 'updated work', work_status: 'changed status', work_subtask_create: 'added a subtask' })[item.action] || 'made an update',
      icon: item.entityType === 'campaign' ? 'megaphone' : 'square-check-big',
      createdAt: item.createdAt,
      href: item.entityType === 'campaign' ? '/campaigns' : `/work/${encodeURIComponent(item.entityType)}/${item.entityId}`
    }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 15);
}

function sampleMovements(workTypes, canViewLeads, canViewAds, now = new Date()) {
  const samples = [];
  const task = workTypes.find(type => type.key === 'task') || workTypes[0];
  if (task) samples.push(
    { actor: 'Riya Sharma', action: 'completed a task', title: 'Prepare the September campaign brief', message: 'Brief checked and ready for the next production step.', category: task.name, group: 'work', icon: 'circle-check', status: 'Completed', tone: 'green' },
    { actor: 'Arjun Mehta', action: 'shared a progress update', title: 'Homepage design — first draft', message: 'First draft is ready for internal review.', category: task.name, group: 'work', icon: 'pencil-line', status: 'In review', tone: 'violet' },
    { actor: 'Riya Sharma', action: 'assigned a task', title: 'Prepare launch-day social posts', message: 'Assigned to the content team. Due tomorrow.', category: task.name, group: 'work', icon: 'user-plus', status: 'In progress', tone: 'blue' }
  );
  if (canViewLeads) samples.push(
    { actor: 'Neha Patel', action: 'moved a lead', title: 'Northstar Studio', message: 'Discovery call completed. Preparing a tailored proposal.', category: 'Leads', group: 'leads', icon: 'arrow-right-left', status: 'Proposal sent', tone: 'amber' },
    { actor: 'Kabir Shah', action: 'completed a follow-up', title: 'Bloom & Co. — website enquiry', message: 'Client confirmed the scope. Next check-in is on Friday.', category: 'Leads', group: 'leads', icon: 'phone', status: 'Follow-up done', tone: 'green' }
  );
  if (canViewAds) samples.push({ actor: 'Neha Patel', action: 'updated a campaign', title: 'September lead generation', message: 'Campaign brief and audience notes updated.', category: 'Campaigns', group: 'campaigns', icon: 'megaphone', status: 'Updated', tone: 'violet' });
  return samples.map((sample, index) => ({ ...sample, id: `sample-${index}`, href: '', sample: true, createdAt: new Date(now.getTime() - (index * 37 + 4) * 60000) }));
}

module.exports = { movementAuditFilter, dashboardMovements, sampleMovements };
