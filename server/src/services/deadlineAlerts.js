const WorkType = require('../models/WorkType');
const CustomRecord = require('../models/CustomRecord');
const Notification = require('../models/Notification');
const User = require('../models/User');
const EmailAccount = require('../models/EmailAccount');
const { sendEmail, isValidEmail } = require('./emailService');

async function sendReminderEmail({ account, to, title, message, link, workTypeName }) {
  const base = String(process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  const absoluteLink = base ? `${base}${link}` : link;
  await sendEmail(account, {
    to,
    subject: title,
    body: `${message}\n\nModule: ${workTypeName}\nView in CRM: ${absoluteLink}`
  });
}

async function checkDeadlinesAndNotify() {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const endOfTomorrow = new Date(endOfToday);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

    // Active SMTP accounts per organization (email delivery for reminders).
    const accounts = await EmailAccount.find({ isActive: true });
    const accountByOrg = new Map();
    for (const account of accounts) accountByOrg.set(String(account.organization), account);

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
        status: { $in: openStatuses },
        deadline: { $ne: null, $lt: endOfTomorrow }
      });

      if (!records.length) continue;

      // Resolve all recipients of this work type once (users + emails).
      const recipientIds = new Set();
      for (const record of records) {
        for (const id of [record.assignedTo, record.secondaryAssignee, ...(record.collaborators || [])]) {
          if (id) recipientIds.add(String(id));
        }
      }
      const usersById = new Map();
      if (recipientIds.size) {
        const users = await User.find({ _id: { $in: Array.from(recipientIds) }, isActive: true }).select('_id name email');
        for (const user of users) usersById.set(String(user._id), user);
      }
      const emailEnabled = String(process.env.REMINDER_EMAIL_ENABLED || 'true').toLowerCase() !== 'false';
      const emailAccount = emailEnabled ? (accountByOrg.get(String(workType.organization)) || null) : null;

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
        // Deduplicate by record + participant + local calendar day.
        const recipients = [...new Set([record.assignedTo, record.secondaryAssignee, ...(record.collaborators || [])].filter(Boolean).map(String))];
        for (const recipient of recipients) {
          const exists = await Notification.exists({ organization: workType.organization, user: recipient, link, createdAt: { $gte: startOfToday } });
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

            const toUser = usersById.get(recipient);
            const channels = ['inapp'];
            const to = toUser && isValidEmail(toUser.email) ? toUser.email : null;
            if (emailAccount && to) channels.push('email');

            await Notification.create({ organization: workType.organization, user: recipient, title, message, link, channels });

            // Fire-and-forget email delivery; failures must never break the
            // scheduler or the in-app notification already created.
            if (channels.includes('email')) {
              sendReminderEmail({ account: emailAccount, to, title, message, link, workTypeName: workType.name })
                .catch(error => console.error('Reminder email dispatch failed:', error.message));
            }
          }
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

  const intervalMs = 60 * 60 * 1000;
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
