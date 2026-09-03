const express = require('express');
const ClientCompany = require('../models/ClientCompany');
const Customer = require('../models/Customer');
const Campaign = require('../models/Campaign');
const CrmStage = require('../models/CrmStage');
const Activity = require('../models/Activity');
const SyncLog = require('../models/SyncLog');
const { dispatchLeadWebhook } = require('../services/webhookDispatcher');
const { logAudit } = require('../utils/audit');

const router = express.Router();

function normalizePhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.length >= 10 ? clean.slice(-10) : clean;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simple in-memory IP tracker for authentication failures rate-limiting
const failedAuthAttempts = new Map();

// Reset failed attempts log periodically (every 10 minutes)
setInterval(() => {
  failedAuthAttempts.clear();
}, 10 * 60 * 1000);

router.post('/inbound-lead', async (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Rate limiter check
  const failedCount = failedAuthAttempts.get(clientIp) || 0;
  if (failedCount >= 10) {
    console.warn(`Blocked API request from IP ${clientIp} due to excessive auth failures.`);
    return res.status(429).json({ ok: false, error: 'Too many authentication attempts. Please try again later.' });
  }

  try {
    const apiKey = req.headers['x-company-api-key'] || req.query.api_key;
    if (!apiKey) {
      failedAuthAttempts.set(clientIp, failedCount + 1);
      return res.status(401).json({ ok: false, error: 'API Key is missing.' });
    }

    const company = await ClientCompany.findOne({ apiKey }).populate('organization').populate('assignedUsers');
    if (!company) {
      failedAuthAttempts.set(clientIp, failedCount + 1);
      console.warn(`Failed Inbound API attempt from IP ${clientIp} with key: ${apiKey}`);
      return res.status(401).json({ ok: false, error: 'Invalid API Key.' });
    }
    if (company.apiKeyStatus === 'disabled') {
      failedAuthAttempts.set(clientIp, failedCount + 1);
      return res.status(403).json({ ok: false, error: 'This API key is disabled.' });
    }

    // Reset failed count on successful auth
    failedAuthAttempts.delete(clientIp);

    const { name, phone, email, value, source, campaignName, notes, customData, utmSource, utmMedium, utmCampaign, utmContent, utmTerm } = req.body;

    if (!name && !email && !phone) {
      return res.status(400).json({ ok: false, error: 'Lead must contain at least name, email, or phone.' });
    }

    const orgId = company.organization._id;

    const phoneSuffix = normalizePhone(phone);

    let existingCustomer = null;

    // Match only inside the authenticated client company so identical contacts
    // across separate agency clients do not collapse into one lead.
    if (email) {
      existingCustomer = await Customer.findOne({
        organization: orgId,
        clientCompany: company._id,
        email: String(email).trim().toLowerCase()
      });
    }

    if (!existingCustomer && phoneSuffix && phoneSuffix.length >= 7) {
      existingCustomer = await Customer.findOne({
        organization: orgId,
        clientCompany: company._id,
        phoneNormalized: phoneSuffix
      });
    }

    if (existingCustomer) {
      // DUPLICATE LEAD: Merge details, PRESERVE stage and assignedTo
      
      // Update custom fields in Mongoose Map without overwriting completely
      if (customData && typeof customData === 'object') {
        for (const [key, val] of Object.entries(customData)) {
          existingCustomer.customData.set(key, String(val));
        }
      }

      // Append note chronologically
      if (notes) {
        existingCustomer.notes = existingCustomer.notes 
          ? `${existingCustomer.notes}\n---\nSync Note: ${notes}`
          : notes;
      }
      
      // Save changes
      await existingCustomer.save();

      // Log activity
      await Activity.create({
        organization: orgId,
        customer: existingCustomer._id,
        user: null, // System event
        type: 'note',
        note: 'Lead details updated/merged via Inbound API sync.'
      });

      // Log sync success
      await SyncLog.create({
        organization: orgId,
        clientCompany: company._id,
        source: 'Inbound API',
        status: 'success',
        recordsProcessed: 1,
        recordsCreated: 0,
        recordsUpdated: 1
      });
      await logAudit(req, {
        organization: orgId,
        user: null,
        action: 'api_update',
        entityType: 'customer',
        entityId: existingCustomer._id,
        entityName: existingCustomer.name,
        message: `Lead "${existingCustomer.name}" updated via inbound API.`,
        metadata: { clientCompany: company._id }
      });

      return res.json({ ok: true, action: 'updated', customerId: existingCustomer._id });
    } else {
      // NEW LEAD: Find campaign matching campaignName
      let campaignId = null;
      if (campaignName) {
        const campaign = await Campaign.findOne({
          organization: orgId,
          clientCompany: company._id,
          name: new RegExp(`^${escapeRegex(String(campaignName).trim())}$`, 'i')
        });
        if (campaign) {
          campaignId = campaign._id;
        }
      }

      // Find default first stage
      const firstStage = await CrmStage.findOne({ organization: orgId, clientCompany: company._id, isActive: true }).sort({ order: 1 });
      if (!firstStage) {
        await SyncLog.create({
          organization: orgId,
          clientCompany: company._id,
          source: 'Inbound API',
          status: 'failure',
          recordsProcessed: 1,
          error: 'No active CRM stage exists.'
        });
        return res.status(422).json({ ok: false, error: 'No active CRM stage exists. Create an active stage before accepting inbound leads.' });
      }

      // Apply Round-Robin Lead Routing Rule
      let assignedTo = null;
      if (company.leadRoutingRule === 'round-robin' && company.assignedUsers && company.assignedUsers.length > 0) {
        let index = company.lastAssignedAgentIndex || 0;
        if (index >= company.assignedUsers.length) {
          index = 0;
        }
        assignedTo = company.assignedUsers[index]._id;
        
        // Update index for next lead assignment
        company.lastAssignedAgentIndex = (index + 1) % company.assignedUsers.length;
        await company.save();
      }

      const newLead = await Customer.create({
        organization: orgId,
        name: name || email || phone,
        company: company.name,
        email: email ? String(email).trim().toLowerCase() : '',
        phone: phone || '',
        source: source || 'Inbound API',
        value: Number(value || 0),
        stage: firstStage._id,
        clientCompany: company._id,
        campaign: campaignId,
        notes: notes || '',
        customData: customData || {},
        assignedTo,
        utmSource: utmSource || '',
        utmMedium: utmMedium || '',
        utmCampaign: utmCampaign || '',
        utmContent: utmContent || '',
        utmTerm: utmTerm || ''
      });

      // Log activity
      await Activity.create({
        organization: orgId,
        customer: newLead._id,
        user: null, // System event
        type: 'note',
        note: 'Lead created via Inbound API intake.'
      });

      // Log sync success
      await SyncLog.create({
        organization: orgId,
        clientCompany: company._id,
        source: 'Inbound API',
        status: 'success',
        recordsProcessed: 1,
        recordsCreated: 1,
        recordsUpdated: 0
      });
      await logAudit(req, {
        organization: orgId,
        user: null,
        action: 'api_create',
        entityType: 'customer',
        entityId: newLead._id,
        entityName: newLead.name,
        message: `Lead "${newLead.name}" created via inbound API.`,
        metadata: { clientCompany: company._id, campaign: campaignId }
      });

      // Dispatch outbound webhook (auto-responder) asynchronously
      dispatchLeadWebhook(company, newLead).catch(err => {
        console.error('Error dispatching lead webhook:', err);
      });

      return res.status(201).json({ ok: true, action: 'created', customerId: newLead._id });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
