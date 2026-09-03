const potentialName = /^(hp|high[\s_-]+potential|hp\s*\(high potential\))$/i;

function isPotentialLabel(label) {
  return label.isActive !== false && (label.isHighPotential === true || (label.isHighPotential == null && potentialName.test(label.name)));
}

function potentialFilter(labels, stages) {
  return { $or: [
    { labels: { $in: labels.filter(isPotentialLabel).map(label => label._id) } },
    { stage: { $in: stages.filter(stage => stage.isActive !== false && !stage.isWon && potentialName.test(stage.name)).map(stage => stage._id) } }
  ] };
}

module.exports = { potentialName, isPotentialLabel, potentialFilter };
