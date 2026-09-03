const CrmStage = require('../models/CrmStage');

// Single source of truth for the lead/client boundary: a customer is a client
// exactly when its stage has isWon set. Every route must derive won stages
// through these helpers so /customers, /clients, dashboards, and reports can
// never drift apart.

async function getWonStageIds(organization, clientCompany) {
  const wonStages = await CrmStage.find({ organization, clientCompany, isWon: true }).select('_id');
  return wonStages.map(stage => stage._id);
}

function getWonStageIdSet(stages) {
  return new Set(stages.filter(stage => stage.isWon).map(stage => String(stage._id)));
}

module.exports = { getWonStageIds, getWonStageIdSet };
