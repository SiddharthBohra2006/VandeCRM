const rules = {
  task: { status: 'completed', fields: ['deliveryLink', 'notes'], proof: 'add a completion note or delivery link' },
  video: { status: 'delivered', fields: ['deliveryLink'], proof: 'add the final video link' },
  design: { status: 'delivered', fields: ['deliveryLink'], proof: 'add the final design link' },
  website: { status: 'live', fields: ['deliveryLink'], proof: 'add the live website link' },
  content: { status: 'published', fields: ['publishedLink'], proof: 'add the published link' }
};

const configuredStatus = item => item.workType?.statuses?.find(status => status.key === item.status);
const isComplete = item => configuredStatus(item) ? Boolean(configuredStatus(item).isTerminalWon) : Boolean(rules[item.type] && item.status === rules[item.type].status && rules[item.type].fields.some(field => String(item[field] || '').trim()));
const isClosed = item => configuredStatus(item) ? Boolean(configuredStatus(item).isTerminalWon || configuredStatus(item).isTerminalLost) : isComplete(item);
const completionError = item => {
  const rule = rules[item.type];
  return rule && item.status === rule.status && !isComplete(item) ? `To mark this ${item.type} complete, ${rule.proof}.` : '';
};

module.exports = { rules, isComplete, isClosed, completionError };
