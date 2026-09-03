const labels = {
  title: 'Title', clientCompany: 'Company', assignedTo: 'Assigned to', collaborators: 'Collaborators',
  secondaryAssignee: 'Designer', status: 'Status', priority: 'Priority', deadline: 'Due date', startDate: 'Start date',
  deliveredAt: 'Delivered date', revisionCount: 'Revision count', notes: 'Notes', taskType: 'Task type', platform: 'Platform',
  designType: 'Design type', contentFormat: 'Format', contentPillar: 'Content pillar', pageCount: 'No. of pages',
  sopLink: 'SOP link', workingFileLink: 'Working file link', draftLink: 'Draft link', scriptLink: 'Script link',
  footageLink: 'Footage link', thumbnailLink: 'Thumbnail link', publishedLink: 'Published link',
  requirementDocLink: 'Requirement document link', contentDocLink: 'Content document link', designLink: 'Design link',
  stagingLink: 'Staging link', designBrief: 'Design brief', copyText: 'Text / Copy', hook: 'Hook', caption: 'Caption',
  cta: 'CTA', views: 'Views', likes: 'Likes', comments: 'Comments', shares: 'Shares', saves: 'Saves',
  leadsGenerated: 'Leads', referenceLink: 'Reference link', deliveryLink: 'Final delivery link'
};
const numberFields = new Set(['revisionCount', 'pageCount', 'views', 'likes', 'comments', 'shares', 'saves', 'leadsGenerated']);
const dateFields = new Set(['deadline', 'startDate', 'deliveredAt']);
const linkFields = new Set(Object.keys(labels).filter(key => key.endsWith('Link')));
const textareas = new Set(['notes', 'designBrief', 'copyText', 'caption']);
const selects = {
  taskType: ['General', 'Client work', 'Internal', 'Follow-up', 'Payment'],
  designType: ['Static Post', 'Carousel', 'Story', 'Thumbnail', 'Banner', 'Other'],
  contentFormat: ['Reel', 'Post', 'Carousel', 'Blog', 'Email', 'Other']
};
const universal = new Set(['title', 'clientCompany', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes']);
const field = (key, group = 'core') => ({
  key, label: labels[key] || key, group,
  type: selects[key] ? 'select' : numberFields.has(key) ? 'number' : dateFields.has(key) ? 'date' : linkFields.has(key) ? 'url' : textareas.has(key) ? 'textarea' : 'text',
  ...(selects[key] ? { options: selects[key] } : {})
});
const statuses = keys => keys.map(key => ({ key, label: key.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' '), color: '#64748b', isTerminalWon: ['completed', 'delivered', 'live', 'published'].includes(key) }));
const definition = (key, name, statusKeys, core, links, order, icon) => ({
  key, name, order, icon, color: '#64748b', statuses: statuses(statusKeys),
  fields: [...core.map(key => field(key)), ...links.map(key => field(key, 'links'))].filter(item => !universal.has(item.key))
});
const DEFAULT_WORK_TYPES = [
  definition('task', 'Tasks', ['pending', 'started', 'in_progress', 'review', 'approved', 'completed', 'on_hold'], ['title', 'taskType', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'startDate', 'notes'], ['sopLink', 'referenceLink', 'workingFileLink', 'draftLink', 'deliveryLink'], 10, 'square-check-big'),
  definition('meeting', 'Meetings', ['scheduled', 'rescheduled', 'held', 'cancelled', 'no_show'], ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'notes'], ['referenceLink'], 15, 'calendar'),
  definition('video', 'Videos', ['pending', 'started', 'in_progress', 'review', 'revision', 'approved', 'delivered'], ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'revisionCount', 'platform', 'deliveredAt', 'notes'], ['scriptLink', 'footageLink', 'referenceLink', 'draftLink', 'deliveryLink', 'thumbnailLink', 'publishedLink'], 20, 'clapperboard'),
  definition('design', 'Designs', ['pending', 'started', 'in_progress', 'review', 'revision', 'approved', 'delivered'], ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'revisionCount', 'designType', 'designBrief', 'copyText', 'deliveredAt'], ['referenceLink', 'draftLink', 'deliveryLink'], 30, 'palette'),
  definition('website', 'Websites', ['requirement_pending', 'development', 'review', 'testing', 'live', 'on_hold'], ['title', 'clientCompany', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'pageCount', 'startDate', 'notes'], ['requirementDocLink', 'contentDocLink', 'designLink', 'stagingLink', 'deliveryLink'], 40, 'globe'),
  definition('content', 'Content', ['idea', 'in_progress', 'review', 'approved', 'scheduled', 'published'], ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'contentFormat', 'platform', 'contentPillar', 'hook', 'caption', 'cta', 'views', 'likes', 'comments', 'shares', 'saves', 'leadsGenerated'], ['scriptLink', 'publishedLink'], 50, 'pen-line')
];

const task = DEFAULT_WORK_TYPES.find(type => type.key === 'task');
task.fields.push(field('repeatMonthly'), field('repeatDay'));
Object.assign(task.fields.at(-2), { label: 'Repeat every month', type: 'checkbox' });
Object.assign(task.fields.at(-1), { label: 'Repeat on day', type: 'number', min: 1, max: 31, defaultValue: 1 });

const video = DEFAULT_WORK_TYPES.find(type => type.key === 'video');
video.fields.push(
  { key: 'productionLane', label: 'Production lane', type: 'select', options: ['System A', 'System B', 'System C', 'System D', 'Final system'], group: 'core' },
  { key: 'footageLocation', label: 'RAW footage location', type: 'select', options: ['SSD-1', 'SSD-2', 'SSD-3', 'Cloud', 'Other'], group: 'core' },
  ...['Story cut', 'Music', 'Transitions / Zooms', 'B-Rolls', 'Finalisation', 'Captions (AI)'].flatMap(label => {
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return [
      { key: `${key}Status`, label: `${label} status`, type: 'select', options: ['Pending', 'In progress', 'Done', 'Blocked', 'Rejected'], group: 'core' },
      { key: `${key}Assignee`, label: `${label} assigned to`, type: 'user-picker', group: 'core' }
    ];
  })
);
video.presentation = {
  enabledViews: ['overview', 'list', 'board', 'calendar'], defaultView: 'overview', calendarField: 'deadline',
  listColumns: ['title', 'status', 'assignedTo', 'deadline'], boardFields: ['assignedTo', 'priority', 'deadline'],
  filterFields: ['status', 'assignedTo', 'custom:productionLane', 'custom:platform'],
  overviewGroupFields: ['custom:productionLane', 'custom:platform'],
  overviewProgressFields: ['custom:story_cutStatus', 'custom:musicStatus', 'custom:transitions_zoomsStatus', 'custom:b_rollsStatus', 'custom:finalisationStatus', 'custom:captions_aiStatus'],
  overviewCompleteValue: 'Done'
};

DEFAULT_WORK_TYPES.push({
  key: 'payment', name: 'Payments', order: 60, icon: 'indian-rupee', color: '#16a34a', isActive: true,
  statuses: statuses(['pending', 'partial', 'paid', 'overdue']),
  fields: [
    { key: 'billingMonth', label: 'Billing month', type: 'text', required: true, group: 'core' },
    { key: 'expectedAmount', label: 'Expected amount', type: 'currency', min: 0, group: 'core' },
    { key: 'paidAmount', label: 'Amount paid', type: 'currency', min: 0, group: 'core' },
    { key: 'paymentDate', label: 'Payment date', type: 'date', group: 'core' }
  ],
  presentation: { enabledViews: ['list', 'calendar'], defaultView: 'list', calendarField: 'deadline', listColumns: ['title', 'status', 'custom:billingMonth', 'custom:expectedAmount', 'custom:paidAmount'], boardFields: ['status'], filterFields: ['status', 'custom:billingMonth'] }
});

module.exports = { DEFAULT_WORK_TYPES };
