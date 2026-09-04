const jwt = require('jsonwebtoken');
const User = require('../../../src/models/User');
const ClientCompany = require('../../../src/models/ClientCompany');
const WorkType = require('../../../src/models/WorkType');
const { hasPermission } = require('../../config/roles');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-jwt-secret-change-in-production';
const JWT_EXPIRES = '7d';

function generateToken(user, activeCompanyId) {
  return jwt.sign(
    {
      userId: String(user._id),
      organizationId: String(user.organization),
      activeCompanyId: activeCompanyId || '',
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

async function requireApiAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId)
      .populate('organization customRole')
      .select('-passwordHash -passwordResetTokenHash -passwordResetExpiresAt');

    if (!user || user.isActive === false) {
      return res.status(401).json({ ok: false, error: 'User not found or inactive' });
    }

    req.user = user;
    req.userObject = user.toObject();

    // Revalidate workspace membership on every request; a JWT is not membership evidence.
    const activeCompanyId = decoded.activeCompanyId || '';
    const filter = authorizedCompanies(user);
    const switching = req.baseUrl === '/api/auth' && req.path === '/switch-company';
    if (activeCompanyId && !switching) {
      if (!/^[a-f\d]{24}$/i.test(String(activeCompanyId))) return res.status(403).json({ ok: false, error: 'Invalid workspace selection.' });
      const company = await ClientCompany.findOne({ ...filter, _id: activeCompanyId }).select('_id');
      if (!company) return res.status(403).json({ ok: false, error: 'Workspace access changed. Select an authorized workspace.' });
      req.activeCompanyId = String(company._id);
    } else {
      const company = await ClientCompany.findOne(filter).sort({ isMain: -1, name: 1 });
      req.activeCompanyId = company ? String(company._id) : null;
    }

    // Load work types for active company
    if (req.activeCompanyId) {
      req.workTypes = await WorkType.find({
        organization: user.organization._id,
        clientCompany: req.activeCompanyId,
        isActive: true,
      }).sort({ order: 1, name: 1 }).lean();
    } else {
      req.workTypes = [];
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }
    next(error);
  }
}

// JWT auth + permission guard that returns JSON (for API routes).
// Requires JWT auth first, then checks the user has the given permission.
function requireApiPermission(permission) {
  return async (req, res, next) => {
    await requireApiAuth(req, res, async (err) => {
      if (err) return next(err);
      if (!req.user || !hasPermission(req.user, permission)) {
        return res.status(403).json({ ok: false, error: 'Access denied' });
      }
      next();
    });
  };
}

function authorizedCompanies(user) {
  return {
    organization: user.organization._id || user.organization,
    status: { $ne: 'inactive' },
    ...(['admin', 'manager'].includes(user.role) ? {} : { assignedUsers: user._id }),
  };
}

module.exports = { authorizedCompanies, requireApiAuth, requireApiPermission, generateToken, JWT_SECRET };
