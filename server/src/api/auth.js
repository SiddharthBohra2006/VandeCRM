const express = require('express');
const User = require('../../src/models/User');
const ClientCompany = require('../../src/models/ClientCompany');
const WorkType = require('../../src/models/WorkType');
const Organization = require('../../src/models/Organization');
const { hashPassword, verifyPassword } = require('../../src/services/passwords');
const { generateToken, requireApiAuth } = require('./middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    const isValid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !isValid || user.isActive === false) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    // Find active company
    const company = await ClientCompany.findOne({
      organization: user.organization,
      assignedUsers: user._id,
      status: { $ne: 'inactive' },
    }).sort({ isMain: -1, name: 1 });

    const token = generateToken(user, company ? String(company._id) : '');

    const userObj = user.toObject();
    delete userObj.passwordHash;
    delete userObj.passwordResetTokenHash;
    delete userObj.passwordResetExpiresAt;

    res.json({
      ok: true,
      token,
      user: userObj,
      activeCompany: company ? { _id: company._id, name: company.name, isMain: company.isMain } : null,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const orgName = String(req.body.orgName || '').trim();

    if (!name || !email || password.length < 8 || !orgName) {
      return res.status(400).json({ ok: false, error: 'Name, email, organization name, and an 8 character password are required.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'An account with this email already exists.' });
    }

    const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let slug = baseSlug || 'org';
    let count = 1;
    while (await Organization.exists({ slug })) {
      slug = `${baseSlug}-${count}`;
      count++;
    }

    const organization = await Organization.create({ name: orgName, slug });

    const user = await User.create({
      organization: organization._id,
      name,
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
      lastLoginAt: new Date(),
    });

    const company = await ClientCompany.create({
      organization: organization._id,
      name: orgName,
      website: '',
      healthStatus: 'healthy',
      assignedUsers: [user._id],
    });

    const { ensureCrmDefaults } = require('../../src/services/defaults');
    await ensureCrmDefaults(organization._id, company._id);

    const token = generateToken(user, String(company._id));

    const userObj = user.toObject();
    delete userObj.passwordHash;

    res.json({
      ok: true,
      token,
      user: userObj,
      activeCompany: { _id: company._id, name: company.name },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me — Get current user + context
router.get('/me', requireApiAuth, async (req, res, next) => {
  try {
    const organization = req.user.organization._id;

    // Get companies
    const companyFilter = { organization, status: { $ne: 'inactive' } };
    if (!['admin', 'manager'].includes(req.user.role)) {
      companyFilter.assignedUsers = req.user._id;
    }
    const companies = await ClientCompany.find(companyFilter)
      .select('_id name isMain')
      .sort({ isMain: -1, name: 1 });

    const activeCompany = companies.find(c => String(c._id) === req.activeCompanyId) || companies[0] || null;

    // Get terminology
    const terminology = activeCompany?.terminology?.toObject?.() || activeCompany?.terminology || {};
    const crmTerms = {
      leadSingular: terminology.leadSingular || 'Lead',
      leadPlural: terminology.leadPlural || 'Leads',
      recordSingular: terminology.recordSingular || 'Client',
      recordPlural: terminology.recordPlural || 'Clients',
      pipelineName: terminology.pipelineName || 'Sales pipeline',
    };

    // Get work types
    const workTypes = activeCompany
      ? await WorkType.find({ organization, clientCompany: activeCompany._id, isActive: true })
          .sort({ order: 1, name: 1 })
          .lean()
      : [];

    res.json({
      ok: true,
      user: req.userObject,
      companies,
      activeCompany,
      crmTerms,
      workTypes,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/switch-company
router.post('/switch-company', requireApiAuth, async (req, res, next) => {
  try {
    const companyId = req.body.companyId;
    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'companyId is required.' });
    }

    const company = await ClientCompany.findOne({
      _id: companyId,
      organization: req.user.organization._id,
      assignedUsers: req.user._id,
      status: { $ne: 'inactive' },
    });

    if (!company) {
      return res.status(404).json({ ok: false, error: 'Company not found or access denied.' });
    }

    const token = generateToken(req.user, String(company._id));

    res.json({
      ok: true,
      token,
      activeCompany: { _id: company._id, name: company.name, isMain: company.isMain },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
