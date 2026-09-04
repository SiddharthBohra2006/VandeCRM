const express = require('express');
const crypto = require('crypto');
const User = require('../../src/models/User');
const ClientCompany = require('../../src/models/ClientCompany');
const WorkType = require('../../src/models/WorkType');
const Organization = require('../../src/models/Organization');
const EmailAccount = require('../../src/models/EmailAccount');
const { hashPassword, verifyPassword } = require('../../src/services/passwords');
const { sendEmail } = require('../../src/services/emailService');
const { generateToken, requireApiAuth, authorizedCompanies } = require('./middleware/auth');
const getRateLimiter = require('./middleware/rateLimiter');

const router = express.Router();
const authRateLimit = getRateLimiter(15, 60 * 1000);

function getSanitizedRecoveryKey() {
  return String(process.env.ADMIN_RECOVERY_KEY || '').trim().replace(/^['"]|['"]$/g, '');
}

function adminRecoveryEnabled() {
  const allow = String(process.env.ALLOW_ADMIN_RECOVERY || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return allow === 'true' && Boolean(getSanitizedRecoveryKey());
}

function recoveryKeyMatches(value) {
  const expected = crypto.createHash('sha256').update(getSanitizedRecoveryKey()).digest();
  const supplied = crypto.createHash('sha256').update(String(value || '').trim()).digest();
  return crypto.timingSafeEqual(expected, supplied);
}

function resetTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicSignupEnabled() {
  return String(process.env.ALLOW_PUBLIC_SIGNUP || '').toLowerCase() === 'true';
}

async function canCreateSignupAccount() {
  if (publicSignupEnabled()) return true;
  return (await User.countDocuments({})) === 0;
}

// POST /api/auth/login
router.post('/login', authRateLimit, async (req, res, next) => {
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
    const company = await ClientCompany.findOne(authorizedCompanies(user)).sort({ isMain: -1, name: 1 });

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
router.post('/signup', authRateLimit, async (req, res, next) => {
  try {
    if (!(await canCreateSignupAccount())) {
      return res.status(403).json({ ok: false, error: 'Public signup is disabled. Ask an admin to invite or create your account.' });
    }

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
      .select('_id name isMain terminology')
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
      ...authorizedCompanies(req.user),
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

// POST /api/auth/forgot-password — request a password reset email
router.post('/forgot-password', authRateLimit, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email, isActive: { $ne: false } });

    if (user) {
      const account = await EmailAccount.findOne({ organization: user.organization, isActive: true }).sort({ updatedAt: -1 });
      if (account) {
        const token = crypto.randomBytes(32).toString('hex');
        user.passwordResetTokenHash = resetTokenHash(token);
        user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await user.save();

        const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const resetUrl = new URL(`/reset-password?token=${token}`, baseUrl).toString();
        try {
          await sendEmail(account, {
            to: user.email,
            subject: 'Reset your Vande Agency CRM password',
            body: `We received a request to reset your password. Use this link within one hour:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
          });
        } catch (emailError) {
          console.error(`Password reset email failed for user ${user._id}:`, emailError.message);
        }
      }
    }

    res.json({ ok: true, message: 'If an active account matches that email, we sent a password reset link.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reset-password — complete a password reset with a valid token
router.post('/reset-password', authRateLimit, async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (password.length < 8 || password !== confirmPassword) {
      return res.status(400).json({
        ok: false,
        error: password !== confirmPassword ? 'Passwords do not match.' : 'Password must be at least 8 characters.',
      });
    }

    const user = token && await User.findOne({
      passwordResetTokenHash: resetTokenHash(token),
      passwordResetExpiresAt: { $gt: new Date() },
      isActive: { $ne: false },
    });

    if (!user) {
      return res.status(400).json({ ok: false, error: 'This password reset link is invalid or has expired.' });
    }

    user.passwordHash = await hashPassword(password);
    user.passwordResetTokenHash = '';
    user.passwordResetExpiresAt = null;
    await user.save();

    res.json({ ok: true, message: 'Password reset. You can now sign in.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/admin-recovery — emergency admin password reset via recovery key
router.post('/admin-recovery', authRateLimit, async (req, res, next) => {
  try {
    if (!adminRecoveryEnabled()) {
      return res.status(404).json({ ok: false, error: 'Admin recovery is not enabled.' });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const user = await User.findOne({ email, role: 'admin' });
    const invalid = !user || !recoveryKeyMatches(req.body.recoveryKey);

    if (invalid || password.length < 8 || password !== confirmPassword) {
      return res.status(400).json({
        ok: false,
        error: password !== confirmPassword ? 'Passwords do not match.' : 'Recovery details are invalid.',
      });
    }

    user.passwordHash = await hashPassword(password);
    await user.save();

    res.json({ ok: true, message: 'Admin password reset. You can now sign in.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
