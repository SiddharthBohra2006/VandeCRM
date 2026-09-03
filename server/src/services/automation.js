const AutomationRule = require('../models/AutomationRule');
const WorkType = require('../models/WorkType');
const CustomRecord = require('../models/CustomRecord');

async function runLeadAutomation({ customer, trigger, previousStage = null }) {
  const rules = await AutomationRule.find({ organization: customer.organization, clientCompany: customer.clientCompany, entityType: { $in: ['lead', null] }, trigger, isActive: true });
  let applied = false;
  for (const rule of rules) {
    if (rule.stage && String(rule.stage) !== String(customer.stage)) continue;
    if (trigger === 'stage_changed' && String(previousStage) === String(customer.stage)) continue;
    if (rule.conditionField && String(customer[rule.conditionField] || '').toLowerCase() !== String(rule.conditionValue || '').toLowerCase()) continue;
    if (rule.action === 'assign_user') customer.assignedTo = rule.targetId;
    if (rule.action === 'add_label' && !customer.labels.map(String).includes(String(rule.targetId))) customer.labels.push(rule.targetId);
    if (rule.action === 'remove_label') customer.labels = customer.labels.filter(label => String(label) !== String(rule.targetId));
    if (rule.action === 'set_priority') customer.priority = rule.actionValue;
    if (rule.action === 'create_record') {
      const workType = await WorkType.findOne({ _id: rule.targetId, organization: customer.organization, clientCompany: customer.clientCompany });
      if (workType) {
        await CustomRecord.create({
          organization: customer.organization,
          workspace: customer.clientCompany,
          module: workType._id,
          title: `${customer.name} - ${workType.name}`,
          status: workType.statuses[0]?.key || 'todo',
          assignedTo: customer.assignedTo || null,
          priority: 'medium',
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          customer: customer._id,
          createdBy: customer.assignedTo || customer.createdBy || rule._id
        });
      }
    }
    applied = true;
    rule.runCount += 1;
    rule.lastRunAt = new Date();
    await rule.save();
  }
  if (applied) await customer.save();
}

const comparable = value => String(value ?? '').trim().toLowerCase();
const fieldValue = (record, key) => key.startsWith('custom:') ? record.customFields?.get?.(key.slice(7)) ?? record.customFields?.[key.slice(7)] : record[key];

async function runRecordAutomation({ record, workType, trigger, previousStatus = null, previousOwner = null }) {
  const rules = await AutomationRule.find({ organization: record.organization, clientCompany: record.workspace, entityType: 'module', workType: workType._id, trigger, isActive: true });
  let applied = false;
  for (const rule of rules) {
    if (rule.status && rule.status !== record.status) continue;
    if (trigger === 'status_changed' && comparable(previousStatus) === comparable(record.status)) continue;
    if (trigger === 'owner_changed' && comparable(previousOwner) === comparable(record.assignedTo)) continue;
    if (rule.conditionField && comparable(fieldValue(record, rule.conditionField)) !== comparable(rule.conditionValue)) continue;
    if (rule.action === 'assign_user') record.assignedTo = rule.targetId;
    if (rule.action === 'set_priority') record.priority = rule.actionValue;
    if (rule.action === 'set_status') record.status = rule.actionValue;
    if (rule.action === 'set_field') {
      const field = workType.fields.find(item => item.key === rule.actionField);
      let value = rule.actionValue;
      if (field?.type === 'checkbox') value = value === 'true';
      if (['number', 'currency', 'percentage'].includes(field?.type)) value = Number(value);
      record.customFields.set(rule.actionField, value);
    }
    rule.runCount += 1;
    rule.lastRunAt = new Date();
    await rule.save();
    applied = true;
  }
  if (applied) await record.save();
  return applied;
}

module.exports = { runLeadAutomation, runRecordAutomation };
