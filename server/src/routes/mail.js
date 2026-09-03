const express = require('express');

const Activity = require('../models/Activity');
const Customer = require('../models/Customer');
const EmailAccount = require('../models/EmailAccount');
const EmailMessage = require('../models/EmailMessage');
const EmailTemplate = require('../models/EmailTemplate');
const { requirePermission } = require('../middleware/auth');
const { encrypt } = require('../services/encryption');
const { isValidEmail, renderTemplate, sendEmail, usesImplicitTls, verifyEmailAccount } = require('../services/emailService');
const { logAudit } = require('../utils/audit');
const { hasPermission } = require('../config/roles');

const router = express.Router();

const templateCategories = ['intro', 'follow_up', 'proposal', 'payment', 'onboarding', 'support', 'custom'];

function getCustomerFilter(req, extra = {}) {
  const filter = { organization: req.user.organization._id, ...extra };
  if (req.user.role === 'agent') filter.assignedTo = req.user._id;
  return filter;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSmtpHost(value) {
  return String(value || '').trim().toLowerCase();
}

function isResendHost(host) {
  return host === 'smtp.resend.com';
}

function buildRenderContext(req, customer) {
  return {
    lead: {
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      company: customer.company || '',
      source: customer.source || ''
    },
    user: {
      name: req.user.name || '',
      email: req.user.email || ''
    },
    organization: {
      name: req.user.organization.name || ''
    }
  };
}

router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const [account, templates, customers, messages] = await Promise.all([
      EmailAccount.findOne({ organization, isActive: true }).sort({ updatedAt: -1 }),
      EmailTemplate.find({ organization, isActive: true }).sort({ category: 1, name: 1 }),
      Customer.find(getCustomerFilter(req, { email: { $nin: ['', null] } }))
        .populate('assignedTo clientCompany campaign')
        .sort({ updatedAt: -1 })
        .limit(150),
      EmailMessage.find({ organization })
        .populate('customer sentBy template')
        .sort({ sentAt: -1 })
        .limit(30)
    ]);

    res.render('mail/index', {
      title: 'Mail Center',
      account,
      templates,
      customers,
      messages,
      templateCategories,
      canCreateTemplates: hasPermission(req.user, 'mail.create'),
      canUpdateTemplates: hasPermission(req.user, 'mail.update'),
      canSendEmails: hasPermission(req.user, 'mail.create'),
      canManageSettings: hasPermission(req.user, 'mail.update'),
      selectedCustomerId: req.query.customer || '',
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/settings', requirePermission('mail.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const smtpPassword = String(req.body.smtpPassword || '').trim();
    const smtpPort = Number(req.body.smtpPort || 587);
    const existing = await EmailAccount.findOne({ organization, isActive: true }).sort({ updatedAt: -1 });
    const updateData = {
      organization,
      name: String(req.body.name || 'Default SMTP').trim(),
      fromName: String(req.body.fromName || '').trim(),
      fromEmail: normalizeEmail(req.body.fromEmail),
      replyTo: normalizeEmail(req.body.replyTo),
      smtpHost: normalizeSmtpHost(req.body.smtpHost),
      smtpPort,
      smtpSecure: req.body.smtpSecure === 'on' || usesImplicitTls(smtpPort),
      smtpUsername: String(req.body.smtpUsername || '').trim(),
      isActive: true
    };

    if (!updateData.fromEmail || !updateData.smtpHost || !updateData.smtpUsername) {
      return res.redirect('/mail?error=From email, SMTP host, and username are required.');
    }
    if (!isValidEmail(updateData.fromEmail) || (updateData.replyTo && !isValidEmail(updateData.replyTo))) {
      return res.redirect('/mail?error=Sender and reply-to must be valid email addresses.');
    }
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      return res.redirect('/mail?error=SMTP port must be between 1 and 65535.');
    }
    if (isResendHost(updateData.smtpHost)) {
      if (!['25', '465', '587', '2465', '2587'].includes(String(smtpPort))) {
        return res.redirect('/mail?error=Resend SMTP supports ports 25, 465, 587, 2465, or 2587.');
      }
      if (updateData.smtpUsername !== 'resend') {
        return res.redirect('/mail?error=Resend SMTP username must be resend.');
      }
      updateData.smtpSecure = usesImplicitTls(smtpPort);
    }
    if (smtpPassword) {
      updateData.smtpPasswordEncrypted = encrypt(smtpPassword);
    } else if (existing) {
      updateData.smtpPasswordEncrypted = existing.smtpPasswordEncrypted;
    } else {
      return res.redirect('/mail?error=SMTP password is required for first setup.');
    }

    try {
      await verifyEmailAccount(updateData);
      updateData.lastVerifiedAt = new Date();
    } catch (verifyError) {
      return res.redirect(`/mail?error=${encodeURIComponent(`SMTP verification failed: ${verifyError.message}`)}`);
    }

    const account = existing
      ? await EmailAccount.findOneAndUpdate({ _id: existing._id, organization }, updateData, { new: true })
      : await EmailAccount.create(updateData);

    await logAudit(req, {
      action: 'email_settings_update',
      entityType: 'email_account',
      entityId: account._id,
      entityName: account.fromEmail,
      message: 'Email SMTP settings updated.'
    });

    res.redirect('/mail?success=Email settings saved.');
  } catch (error) {
    next(error);
  }
});

router.post('/templates', requirePermission('mail.create'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const subject = String(req.body.subject || '').trim();
    const body = String(req.body.body || '').trim();
    const category = templateCategories.includes(req.body.category) ? req.body.category : 'custom';

    if (!name || !subject || !body) {
      return res.redirect('/mail?error=Template name, subject, and body are required.');
    }

    const template = await EmailTemplate.create({
      organization,
      name,
      category,
      subject,
      body,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await logAudit(req, {
      action: 'email_template_create',
      entityType: 'email_template',
      entityId: template._id,
      entityName: template.name,
      message: `Email template "${template.name}" created.`
    });

    res.redirect('/mail?success=Template saved.');
  } catch (error) {
    if (error.code === 11000) return res.redirect('/mail?error=A template with this name already exists.');
    next(error);
  }
});

router.post('/templates/:id', requirePermission('mail.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const action = req.body.action === 'delete' ? 'delete' : 'update';
    const template = await EmailTemplate.findOne({ _id: req.params.id, organization });
    if (!template) return res.redirect('/mail?error=Template not found.');

    if (action === 'delete') {
      template.isActive = false;
      template.updatedBy = req.user._id;
      await template.save();
      await logAudit(req, {
        action: 'email_template_delete',
        entityType: 'email_template',
        entityId: template._id,
        entityName: template.name,
        message: `Email template "${template.name}" deleted.`
      });
      return res.redirect('/mail?success=Template deleted.');
    }

    template.name = String(req.body.name || '').trim();
    template.category = templateCategories.includes(req.body.category) ? req.body.category : 'custom';
    template.subject = String(req.body.subject || '').trim();
    template.body = String(req.body.body || '').trim();
    template.updatedBy = req.user._id;

    if (!template.name || !template.subject || !template.body) {
      return res.redirect('/mail?error=Template name, subject, and body are required.');
    }

    await template.save();
    await logAudit(req, {
      action: 'email_template_update',
      entityType: 'email_template',
      entityId: template._id,
      entityName: template.name,
      message: `Email template "${template.name}" updated.`
    });

    res.redirect('/mail?success=Template updated.');
  } catch (error) {
    if (error.code === 11000) return res.redirect('/mail?error=A template with this name already exists.');
    next(error);
  }
});

router.post('/send', requirePermission('mail.create'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne(getCustomerFilter(req, { _id: req.body.customer }));
    if (!customer) return res.redirect('/mail?error=Lead not found or not accessible.');

    const toEmail = normalizeEmail(req.body.toEmail || customer.email);
    if (!toEmail) return res.redirect('/mail?error=Selected lead does not have an email address.');
    if (!isValidEmail(toEmail)) return res.redirect('/mail?error=Recipient email address is invalid.');

    const account = await EmailAccount.findOne({ organization, isActive: true }).sort({ updatedAt: -1 });
    if (!account) return res.redirect('/mail?error=Ask an admin to configure SMTP settings before sending email.');

    const template = req.body.template
      ? await EmailTemplate.findOne({ _id: req.body.template, organization, isActive: true })
      : null;

    const context = buildRenderContext(req, customer);
    const subject = renderTemplate(req.body.subject || (template ? template.subject : ''), context).trim();
    const body = renderTemplate(req.body.body || (template ? template.body : ''), context).trim();
    if (!subject || !body) return res.redirect('/mail?error=Subject and body are required.');

    let emailRecord;
    try {
      const result = await sendEmail(account, { to: toEmail, subject, body });
      emailRecord = await EmailMessage.create({
        organization,
        customer: customer._id,
        template: template ? template._id : null,
        sentBy: req.user._id,
        fromEmail: account.fromEmail,
        toEmail,
        subject,
        body,
        status: 'sent',
        providerMessageId: result.messageId || '',
        sentAt: new Date()
      });

      await Activity.create({
        organization,
        customer: customer._id,
        user: req.user._id,
        type: 'email',
        note: `Email sent to ${toEmail}: ${subject}`
      });

      customer.lastContactedAt = new Date();
      await customer.save();

      await logAudit(req, {
        action: 'email_send',
        entityType: 'email_message',
        entityId: emailRecord._id,
        entityName: subject,
        message: `Email sent to "${customer.name}".`,
        metadata: { customer: customer._id, toEmail, template: template ? template._id : null }
      });

      return res.redirect('/mail?success=Email sent.');
    } catch (sendError) {
      emailRecord = await EmailMessage.create({
        organization,
        customer: customer._id,
        template: template ? template._id : null,
        sentBy: req.user._id,
        fromEmail: account.fromEmail,
        toEmail,
        subject,
        body,
        status: 'failed',
        error: sendError.message,
        sentAt: new Date()
      });

      await logAudit(req, {
        action: 'email_send_failure',
        entityType: 'email_message',
        entityId: emailRecord._id,
        entityName: subject,
        message: `Email failed for "${customer.name}".`,
        metadata: { customer: customer._id, toEmail, error: sendError.message }
      });

      return res.redirect(`/mail?error=${encodeURIComponent(`Email failed: ${sendError.message}`)}`);
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
