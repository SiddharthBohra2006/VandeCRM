const numericTypes = new Set(['number', 'currency', 'percentage']);
const coreFields = { priority: 'Priority', status: 'Status', assignedTo: 'Owner' };

const valueOf = (item, key) => key.startsWith('custom:') ? item.customFields?.get?.(key.slice(7)) ?? item.customFields?.[key.slice(7)] : item[key];
const labelOf = (item, key, workType) => {
  const value = valueOf(item, key);
  if (key === 'assignedTo') return item.assignedTo?.name || 'Unassigned';
  if (key === 'status') return workType.statuses.find(status => status.key === value)?.label || value || 'Blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '').trim() || 'Blank';
};

function reportOptions(workType) {
  const custom = workType.fields.map(field => ({ key: `custom:${field.key}`, label: field.label, numeric: numericTypes.has(field.type) }));
  return {
    groups: [...Object.entries(coreFields).map(([key, label]) => ({ key, label })), ...custom],
    numeric: custom.filter(field => field.numeric)
  };
}

function normalizeConfig(query, workType) {
  const options = reportOptions(workType);
  const groupKeys = new Set(options.groups.map(item => item.key));
  const numericKeys = new Set(options.numeric.map(item => item.key));
  const rawMetrics = Array.isArray(query.metrics) ? query.metrics : query.metrics ? [query.metrics] : ['count:*'];
  const metrics = rawMetrics.filter(token => {
    const [formula, field] = String(token).split(':', 2);
    return formula === 'count' && field === '*' || ['sum', 'avg', 'min', 'max'].includes(formula) && numericKeys.has(`custom:${field}`);
  }).slice(0, 4);
  return {
    module: String(query.module || workType._id),
    groupBy: groupKeys.has(query.groupBy) ? query.groupBy : 'status',
    metrics: metrics.length ? metrics : ['count:*'],
    chart: ['table', 'bar', 'donut'].includes(query.chart) ? query.chart : 'bar',
    status: workType.statuses.some(status => status.key === query.status) ? query.status : '',
    owner: String(query.owner || ''),
    dateFrom: String(query.dateFrom || ''),
    dateTo: String(query.dateTo || ''),
    filterField: groupKeys.has(query.filterField) ? query.filterField : '',
    filterValue: String(query.filterValue || '').trim()
  };
}

function metricDefinition(token, workType) {
  const [formula, rawField] = token.split(':', 2);
  if (formula === 'count') return { token, formula, field: '', label: 'Record count' };
  const field = workType.fields.find(item => item.key === rawField);
  return { token, formula, field: `custom:${rawField}`, label: `${formula.toUpperCase()} of ${field.label}` };
}

function buildModuleReport(items, workType, config) {
  const definitions = config.metrics.map(token => metricDefinition(token, workType));
  const filtered = config.filterField && config.filterValue
    ? items.filter(item => labelOf(item, config.filterField, workType).toLowerCase() === config.filterValue.toLowerCase())
    : items;
  const groups = new Map();
  filtered.forEach(item => {
    const label = labelOf(item, config.groupBy, workType);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  });
  const rows = [...groups.entries()].map(([Group, records]) => {
    const row = { Group };
    definitions.forEach(definition => {
      if (definition.formula === 'count') return row[definition.label] = records.length;
      const values = records.map(item => Number(valueOf(item, definition.field))).filter(Number.isFinite);
      const total = values.reduce((sum, value) => sum + value, 0);
      row[definition.label] = definition.formula === 'sum' ? total : definition.formula === 'avg' ? (values.length ? total / values.length : 0) : definition.formula === 'min' ? (values.length ? Math.min(...values) : 0) : (values.length ? Math.max(...values) : 0);
    });
    return row;
  }).sort((a, b) => Number(b[definitions[0].label]) - Number(a[definitions[0].label]));
  return { columns: ['Group', ...definitions.map(item => item.label)], rows, definitions, totalRecords: filtered.length, records: filtered };
}

module.exports = { reportOptions, normalizeConfig, buildModuleReport };
