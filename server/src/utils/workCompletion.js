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
const fieldValue = (item, key) => String((item && (item[key] ?? item.customFields?.get?.(key))) ?? '').trim();
// Guard for moving a record into its terminal-won status: the proof fields (a
// delivery link, published link, etc.) must be present, otherwise the status
// change is rejected. The JS work routes pass the WorkType because dynamic
// fields are stored in customFields and the pipeline key lives on the type.
const completionError = (item, workType) => {
  const rule = rules[workType?.key];
  if (!rule) return '';
  const definition = workType?.statuses?.find(status => status.key === item.status);
  if (!definition || !definition.isTerminalWon || item.status !== rule.status) return '';
  if (rule.fields.some(field => !fieldValue(item, field))) return `To mark this ${workType.key} complete, ${rule.proof}.`;
  return '';
};

module.exports = { rules, isComplete, isClosed, completionError };
