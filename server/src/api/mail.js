const express = require('express');
const { requireApiAuth } = require('./middleware/auth');
const Activity = require('../models/Activity');
const Customer = require('../models/Customer');
const EmailAccount = require('../models/EmailAccount');
const EmailMessage = require('../models/EmailMessage');
const EmailTemplate = require('../models/EmailTemplate');
const { encrypt } = require('../services/encryption');
const { isValidEmail, renderTemplate, sendEmail, usesImplicitTls, verifyEmailAccount } = require('../services/emailService');
const { logAudit } = require('../utils/audit');
const { hasPermission, isRestrictedUser } = require('../config/roles');
const getRateLimiter = require('./middleware/rateLimiter');

const mailSendLimiter = getRateLimiter(60, 60 * 1000);

const router = express.Router();
router.use(requireApiAuth);
const apiPermission = require('./middleware/permission');
router.use(apiPermission('mail.view'));

const templateCategories = ['intro', 'follow_up', 'proposal', 'payment', 'onboarding', 'support', 'custom'];

function getCustomerFilter(req, extra = {}) {
  const filter = { organization: req.user.organization._id, ...extra };
  if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;
  return filter;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSmtpHost(value) {
  return String(value || '').trim().toLowerCase();
}

function buildRenderContext(req, customer) {
  return {
    lead: {
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      company: customer.company || '',
      source: customer.source || '',
    },
    user: {
      name: req.user.name || '',
      email: req.user.email || '',
    },
    organization: {
      name: req.user.organization.name || '',
    },
  };
}

// GET /api/mail — Mail center data
router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    let messageFilter = { organization };
    if (isRestrictedUser(req.user)) {
      const allowedCustomerIds = await Customer.find(getCustomerFilter(req)).distinct('_id');
      messageFilter = {
        organization,
        $or: [
          { sentBy: req.user._id },
          { customer: { $in: allowedCustomerIds } },
        ],
      };
    }

    const [account, templates, customers, messages] = await Promise.all([
      EmailAccount.findOne({ organization, isActive: true }).sort({ updatedAt: -1 }).lean(),
      EmailTemplate.find({ organization, isActive: true }).sort({ category: 1, name: 1 }).lean(),
      Customer.find(getCustomerFilter(req, { email: { $nin: ['', null] } }))
        .populate('assignedTo clientCompany campaign')
        .sort({ updatedAt: -1 })
        .limit(150)
        .lean(),
      EmailMessage.find(messageFilter)
        .populate('customer sentBy template')
        .sort({ sentAt: -1 })
        .limit(30)
        .lean(),
    ]);

    res.json({
      ok: true,
      account: account
        ? {
            _id: account._id,
            name: account.name,
            fromName: account.fromName,
            fromEmail: account.fromEmail,
            replyTo: account.replyTo,
            smtpHost: account.smtpHost,
            smtpPort: account.smtpPort,
            smtpSecure: account.smtpSecure,
            smtpUsername: account.smtpUsername,
            lastVerifiedAt: account.lastVerifiedAt,
            isActive: account.isActive,
          }
        : null,
      templates,
      customers,
      messages,
      templateCategories,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/mail/send — Send email to customer
router.post('/send', mailSendLimiter, apiPermission('mail.create'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { customerId, templateId, subject: rawSubject, body: rawBody } = req.body;

    const customer = await Customer.findOne(getCustomerFilter(req, { _id: customerId }));
    if (!customer || !customer.email) {
      return res.status(400).json({ ok: false, error: 'Recipient customer with a valid email is required.' });
    }

    const account = await EmailAccount.findOne({ organization, isActive: true }).sort({ updatedAt: -1 });
    if (!account) {
      return res.status(400).json({ ok: false, error: 'Configure and verify SMTP settings before sending emails.' });
    }

    let template = null;
    let finalSubject = rawSubject;
    let finalBody = rawBody;

    if (templateId) {
      template = await EmailTemplate.findOne({ _id: templateId, organization });
      if (template) {
        finalSubject = finalSubject || template.subject;
        finalBody = finalBody || template.body;
      }
    }

    if (!finalSubject || !finalBody) {
      return res.status(400).json({ ok: false, error: 'Subject and body are required.' });
    }

    const context = buildRenderContext(req, customer);
    const renderedSubject = renderTemplate(finalSubject, context);
    const renderedBody = renderTemplate(finalBody, context);

    await sendEmail({
      account,
      to: customer.email,
      subject: renderedSubject,
      text: renderedBody,
    });

    const emailMessage = await EmailMessage.create({
      organization,
      customer: customer._id,
      sentBy: req.user._id,
      template: template ? template._id : null,
      toEmail: customer.email,
      fromEmail: account.fromEmail,
      subject: renderedSubject,
      body: renderedBody,
      sentAt: new Date(),
    });

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'email',
      note: `Sent email: "${renderedSubject}"`,
      createdAt: new Date(),
    });

    await logAudit(req, {
      action: 'send_email',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Email "${renderedSubject}" sent to ${customer.email}.`,
    });

    res.json({ ok: true, data: emailMessage });
  } catch (error) {
    next(error);
  }
});

// POST /api/mail/templates — Create email template
router.post('/templates', apiPermission('mail.create'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { name, category, subject, body } = req.body;

    const trimmedName = String(name || '').trim();
    const trimmedSubject = String(subject || '').trim();
    const trimmedBody = String(body || '').trim();

    if (!trimmedName || !trimmedSubject || !trimmedBody) {
      return res.status(400).json({ ok: false, error: 'Name, subject, and body are required.' });
    }

    const template = await EmailTemplate.create({
      organization,
      name: trimmedName,
      category: templateCategories.includes(category) ? category : 'custom',
      subject: trimmedSubject,
      body: trimmedBody,
      createdBy: req.user._id,
      updatedBy: req.user._id,
      isActive: true,
    });

    await logAudit(req, {
      action: 'create_template',
      entityType: 'email_template',
      entityId: template._id,
      entityName: template.name,
      message: `Email template "${template.name}" created.`,
    });

    res.json({ ok: true, data: template });
  } catch (error) {
    next(error);
  }
});

// PUT /api/mail/templates/:id — Update email template
router.put('/templates/:id', apiPermission('mail.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const template = await EmailTemplate.findOne({ _id: req.params.id, organization });

    if (!template) {
      return res.status(404).json({ ok: false, error: 'Template not found.' });
    }

    const { name, category, subject, body } = req.body;
    if (name) template.name = String(name).trim();
    if (category && templateCategories.includes(category)) template.category = category;
    if (subject) template.subject = String(subject).trim();
    if (body) template.body = String(body).trim();
    template.updatedBy = req.user._id;

    await template.save();

    await logAudit(req, {
      action: 'update_template',
      entityType: 'email_template',
      entityId: template._id,
      entityName: template.name,
      message: `Email template "${template.name}" updated.`,
    });

    res.json({ ok: true, data: template });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/mail/templates/:id — Delete email template
router.delete('/templates/:id', apiPermission('mail.delete'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const template = await EmailTemplate.findOne({ _id: req.params.id, organization });

    if (!template) {
      return res.status(404).json({ ok: false, error: 'Template not found.' });
    }

    await EmailTemplate.deleteOne({ _id: template._id });

    await logAudit(req, {
      action: 'delete_template',
      entityType: 'email_template',
      entityId: req.params.id,
      entityName: template.name,
      message: `Email template "${template.name}" deleted.`,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/mail/settings — Update SMTP settings
router.post('/settings', apiPermission('mail.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { name, fromName, fromEmail, replyTo, smtpHost, smtpPort, smtpUsername, smtpPassword, smtpSecure } = req.body;

    const normalizedFrom = normalizeEmail(fromEmail);
    const normalizedHost = normalizeSmtpHost(smtpHost);
    const portNum = Number(smtpPort) || 587;

    if (!normalizedFrom || !normalizedHost || !smtpUsername) {
      return res.status(400).json({ ok: false, error: 'From email, SMTP host, and username are required.' });
    }

    if (!isValidEmail(normalizedFrom) || (replyTo && !isValidEmail(replyTo))) {
      return res.status(400).json({ ok: false, error: 'Sender and reply-to must be valid email addresses.' });
    }

    const existing = await EmailAccount.findOne({ organization, isActive: true }).sort({ updatedAt: -1 });
    const updateData = {
      organization,
      name: String(name || 'Default SMTP').trim(),
      fromName: String(fromName || '').trim(),
      fromEmail: normalizedFrom,
      replyTo: normalizeEmail(replyTo),
      smtpHost: normalizedHost,
      smtpPort: portNum,
      smtpSecure: Boolean(smtpSecure) || usesImplicitTls(portNum),
      smtpUsername: String(smtpUsername).trim(),
      isActive: true,
    };

    if (smtpPassword) {
      updateData.smtpPasswordEncrypted = encrypt(String(smtpPassword));
    } else if (existing) {
      updateData.smtpPasswordEncrypted = existing.smtpPasswordEncrypted;
    } else {
      return res.status(400).json({ ok: false, error: 'SMTP password is required for initial setup.' });
    }

    try {
      await verifyEmailAccount(updateData);
      updateData.lastVerifiedAt = new Date();
    } catch (verifyError) {
      return res.status(400).json({ ok: false, error: `SMTP verification failed: ${verifyError.message}` });
    }

    const account = existing
      ? await EmailAccount.findOneAndUpdate({ _id: existing._id, organization }, updateData, { new: true })
      : await EmailAccount.create(updateData);

    await logAudit(req, {
      action: 'email_settings_update',
      entityType: 'email_account',
      entityId: account._id,
      entityName: account.fromEmail,
      message: 'Email SMTP settings updated and verified.',
    });

    res.json({ ok: true, data: account });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
