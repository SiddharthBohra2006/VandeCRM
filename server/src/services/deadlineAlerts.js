const WorkType = require('../models/WorkType');
const CustomRecord = require('../models/CustomRecord');
const Notification = require('../models/Notification');

async function checkDeadlinesAndNotify() {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const endOfTomorrow = new Date(endOfToday);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

    // Load active WorkTypes
    const workTypes = await WorkType.find({ isActive: true }).lean();
    
    for (const workType of workTypes) {
      const openStatuses = (workType.statuses || [])
        .filter(s => !s.isTerminalWon && !s.isTerminalLost)
        .map(s => s.key);

      if (!openStatuses.length) continue;

      // Find CustomRecords scoped by organization and workspace
      const records = await CustomRecord.find({
        organization: workType.organization,
        workspace: workType.clientCompany,
        module: workType._id,
        assignedTo: { $ne: null },
        status: { $in: openStatuses },
        deadline: { $ne: null, $lt: endOfTomorrow }
      });

      for (const record of records) {
        const deadline = new Date(record.deadline);
        let alertType = '';
        if (deadline < startOfToday) {
          alertType = 'overdue';
        } else if (deadline >= startOfToday && deadline < endOfToday) {
          alertType = 'today';
        } else if (deadline >= endOfToday && deadline < endOfTomorrow) {
          alertType = 'tomorrow';
        }

        if (!alertType) continue;

        const link = `/work/${workType.key}/${record._id}`;
        
        // ponytail: deduplication is best-effort in a single process, not atomic. Upgrade path: unique index or atomic upsert on notification.
        // Deduplicate by record + assigned user + local calendar day (createdAt >= startOfToday)
        const exists = await Notification.exists({
          organization: workType.organization,
          user: record.assignedTo,
          link,
          createdAt: { $gte: startOfToday }
        });

        if (!exists) {
          let title = '';
          let message = '';
          const formattedDate = deadline.toLocaleDateString('en-IN');
          
          if (alertType === 'overdue') {
            title = `${workType.name} Overdue`;
            message = `"${record.title}" is overdue (due: ${formattedDate}).`;
          } else if (alertType === 'today') {
            title = `${workType.name} Due Today`;
            message = `"${record.title}" is due today.`;
          } else if (alertType === 'tomorrow') {
            title = `${workType.name} Due Tomorrow`;
            message = `"${record.title}" is due tomorrow.`;
          }

          await Notification.create({
            organization: workType.organization,
            user: record.assignedTo,
            title,
            message,
            link
          });
        }
      }
    }
  } catch (error) {
    console.error('Error running deadline notification checks:', error);
    throw error;
  }
}

function startDeadlineScheduler() {
  if (process.env.DEADLINE_SCHEDULER_ENABLED === 'false') return;
  if (global.__vandeDeadlineScheduler) return;

  // Run once immediately
  checkDeadlinesAndNotify().catch(error => {
    console.error('Initial deadline sync check failed:', error);
  });

  const intervalMs = 6 * 60 * 60 * 1000; // 6 hours
  const timer = setInterval(() => {
    checkDeadlinesAndNotify().catch(error => {
      console.error('Scheduled deadline sync check failed:', error);
    });
  }, intervalMs);

  // Allow graceful process shutdown by calling unref() on the interval timer
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  global.__vandeDeadlineScheduler = timer;
}

module.exports = {
  checkDeadlinesAndNotify,
  startDeadlineScheduler
};
