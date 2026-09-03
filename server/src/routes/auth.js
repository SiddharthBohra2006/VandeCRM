const express = require('express');
const crypto = require('crypto');

const User = require('../models/User');
const Organization = require('../models/Organization');
const EmailAccount = require('../models/EmailAccount');
const { getOrCreateDefaultOrganization, ensureCrmDefaults } = require('../services/defaults');
const { hashPassword, verifyPassword } = require('../services/passwords');
const { sendEmail } = require('../services/emailService');
const getRateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

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

function publicSignupEnabled() {
  return String(process.env.ALLOW_PUBLIC_SIGNUP || '').toLowerCase() === 'true';
}

function resetTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function authView(res, options = {}) {
  return res.render('auth/login', {
    title: 'Sign in',
    error: '',
    mode: 'login',
    adminRecoveryEnabled: adminRecoveryEnabled(),
    ...options
  });
}

async function canCreateSignupAccount() {
  if (publicSignupEnabled()) return true;
  return (await User.countDocuments({})) === 0;
}

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  return authView(res);
});

router.get('/forgot-password', (req, res) => {
  if (req.user) return res.redirect('/');
  return authView(res, { title: 'Forgot password', mode: 'forgot' });
});

router.post('/forgot-password', getRateLimiter(5, 15 * 60 * 1000), async (req, res, next) => {
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
        const resetUrl = new URL(`/auth/reset-password?token=${token}`, baseUrl).toString();
        try {
          await sendEmail(account, {
            to: user.email,
            subject: 'Reset your Vande Agency CRM password',
            body: `We received a request to reset your password. Use this link within one hour:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`
          });
        } catch (emailError) {
          console.error(`Password reset email failed for user ${user._id}:`, emailError.message);
        }
      }
    }

    return authView(res, {
      title: 'Check your email',
      success: 'If an active account matches that email, we sent a password reset link.'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/reset-password', async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    const user = token && await User.findOne({
      passwordResetTokenHash: resetTokenHash(token),
      passwordResetExpiresAt: { $gt: new Date() },
      isActive: { $ne: false }
    });
    if (!user) return authView(res, { title: 'Reset password', error: 'This password reset link is invalid or has expired.' });
    return authView(res, { title: 'Reset password', mode: 'reset', token });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', getRateLimiter(10, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    if (password.length < 8 || password !== confirmPassword) {
      return authView(res, { title: 'Reset password', mode: 'reset', token, error: password !== confirmPassword ? 'Passwords do not match.' : 'Password must be at least 8 characters.' });
    }

    const user = token && await User.findOne({
      passwordResetTokenHash: resetTokenHash(token),
      passwordResetExpiresAt: { $gt: new Date() },
      isActive: { $ne: false }
    });
    if (!user) return authView(res, { title: 'Reset password', error: 'This password reset link is invalid or has expired.' });

    user.passwordHash = await hashPassword(password);
    user.passwordResetTokenHash = '';
    user.passwordResetExpiresAt = null;
    await user.save();
    return authView(res, { success: 'Password reset. You can now sign in.' });
  } catch (error) {
    next(error);
  }
});

router.get('/admin-recovery', (req, res) => {
  if (!adminRecoveryEnabled()) return res.status(404).render('errors/404', { title: 'Not found' });
  return res.render('auth/login', { title: 'Admin recovery', error: '', mode: 'recovery', adminRecoveryEnabled: true });
});

router.post('/admin-recovery', getRateLimiter(15, 15 * 60 * 1000), async (req, res, next) => {
  try {
    if (!adminRecoveryEnabled()) return res.status(404).render('errors/404', { title: 'Not found' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const user = await User.findOne({ email, role: 'admin' });
    const invalid = !user || !recoveryKeyMatches(req.body.recoveryKey);

    if (invalid || password.length < 8 || password !== confirmPassword) {
      return res.status(400).render('auth/login', {
        title: 'Admin recovery',
        mode: 'recovery',
        adminRecoveryEnabled: true,
        error: password !== confirmPassword ? 'Passwords do not match.' : 'Recovery details are invalid.'
      });
    }

    user.passwordHash = await hashPassword(password);
    await user.save();
    return res.render('auth/login', {
      title: 'Sign in',
      mode: 'login',
      adminRecoveryEnabled: true,
      error: '',
      success: 'Admin password reset. You can now sign in.'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/signup', async (req, res, next) => {
  try {
  if (req.user) return res.redirect('/');
    if (!(await canCreateSignupAccount())) {
      return res.status(403).render('auth/login', {
        title: 'Sign in',
        error: 'Public signup is disabled. Ask an admin to invite or create your account.',
        mode: 'login'
      });
    }
  return res.render('auth/login', { title: 'Create account', error: '', mode: 'signup' });
  } catch (error) {
    next(error);
  }
});

router.post('/signup', getRateLimiter(10, 60 * 1000), async (req, res, next) => {
  try {
    if (!(await canCreateSignupAccount())) {
      return res.status(403).render('auth/login', {
        title: 'Sign in',
        mode: 'login',
        error: 'Public signup is disabled. Ask an admin to invite or create your account.'
      });
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const orgName = String(req.body.orgName || '').trim();

    if (!name || !email || password.length < 8 || !orgName) {
      return res.status(400).render('auth/login', {
        title: 'Create account',
        mode: 'signup',
        error: 'Name, email, organization name, and an 8 character password are required.'
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).render('auth/login', {
        title: 'Create account',
        mode: 'signup',
        error: 'An account with this email already exists.'
      });
    }

    const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let slug = baseSlug || 'org';
    let count = 1;
    while (await Organization.exists({ slug })) {
      slug = `${baseSlug}-${count}`;
      count++;
    }

    const organization = await Organization.create({
      name: orgName,
      slug
    });

    const user = await User.create({
      organization: organization._id,
      name,
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
      lastLoginAt: new Date()
    });

    const ClientCompany = require('../models/ClientCompany');
    const company = await ClientCompany.create({
      organization: organization._id,
      name: orgName,
      website: '',
      healthStatus: 'healthy',
      assignedUsers: [user._id]
    });

    await ensureCrmDefaults(organization._id, company._id);
    req.session.userId = user._id;
    req.session.activeCompanyId = String(company._id);
    req.session.save(error => error ? next(error) : res.redirect('/settings/setup'));
  } catch (error) {
    next(error);
  }
});

router.post('/login', getRateLimiter(15, 60 * 1000), async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });
    const isValid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !isValid || user.isActive === false) {
      return res.status(401).render('auth/login', {
        title: 'Sign in',
        mode: 'login',
        error: 'Invalid email or password.'
      });
    }

    user.lastLoginAt = new Date();
    await user.save();
    req.session.userId = user._id;
    req.session.save(error => error ? next(error) : res.redirect('/'));
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('connect.sid');
    return res.redirect('/auth/login');
  });
});

module.exports = router;
