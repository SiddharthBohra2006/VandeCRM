// server.js — VandeCRM React backend entry point (CommonJS)
// OWNER: OpenCode (architect). Adapted from original server.js for the React migration.
// Coexists: mounts JSON API routes (/api/*) and serves the React SPA build.
require('dotenv').config();

// Fail closed: a JWT signing secret is mandatory in EVERY environment. If
// neither JWT_SECRET nor the SESSION_SECRET fallback is set, refuse to boot
// rather than silently sign auth tokens with a hardcoded literal.
const effectiveJwtSecret = String(process.env.JWT_SECRET || '').trim() || String(process.env.SESSION_SECRET || '').trim();
if (!effectiveJwtSecret) {
  console.error('CRITICAL ERROR: JWT_SECRET (or SESSION_SECRET as fallback) must be configured. Refusing to boot without a signing secret.');
  process.exit(1);
}

const path = require('path');
const express = require('express');
const cors = require('cors');

const connectDb = require('./config/db');

// API routes (JSON)
const apiAuth = require('./api/auth');
const apiDashboard = require('./api/dashboard');
const apiCustomers = require('./api/customers');
const apiClients = require('./api/clients');
const apiCampaigns = require('./api/campaigns');
const apiWork = require('./api/work');
const apiTeam = require('./api/team');
const apiSettings = require('./api/settings');
const apiCompanies = require('./api/companies');
const apiFollowUps = require('./api/follow-ups');
const apiNotifications = require('./api/notifications');
const apiMail = require('./api/mail');
const apiIntegrations = require('./api/integrations');
const apiAudit = require('./api/audit');
const apiSearch = require('./api/search');
const apiPortfolio = require('./api/portfolio');
const apiAnalytics = require('./api/analytics');
const apiReports = require('./api/reports');
const apiClientDashboard = require('./api/clientDashboard');

// ============================================
// REGISTER ALL MONGOOSE MODELS AT BOOT
// The original server requires every model so mongoose registers all schemas
// up front. Without this, populate refs (e.g. User -> CustomRole) throw
// MissingSchemaError on authenticated routes. Keep this in sync with the
// models directory so every ref resolves regardless of which API is hit.
// ============================================
require('./models/Activity');
require('./models/Attachment');
require('./models/AuditLog');
require('./models/AutomationRule');
require('./models/Campaign');
require('./models/ClientCompany');
require('./models/CrmLabel');
require('./models/CrmStage');
require('./models/CustomField');
require('./models/CustomRecord');
require('./models/CustomRole');
require('./models/Customer');
require('./models/DashboardView');
require('./models/EmailAccount');
require('./models/EmailMessage');
require('./models/EmailTemplate');
require('./models/Notification');
require('./models/Organization');
require('./models/SavedReport');
require('./models/SavedView');
require('./models/SyncLog');
require('./models/User');
require('./models/WorkType');

const { ensureCrmIndexes, syncWorkTypeDefaults, syncWorkspaceSeedData } = require('./services/defaults');

const app = express();
const securityHeaders = require('./middleware/security');
app.use(securityHeaders);
app.use('/api', require('./api/middleware/responsePrivacy').responsePrivacy);
const port = Number(process.env.PORT) || 5000;

// CORS for React dev server
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

if (process.env.NODE_ENV === 'production') {
  const required = ['MONGO_URI', 'SESSION_SECRET', 'CREDENTIALS_ENCRYPTION_KEY', 'APP_BASE_URL', 'JWT_SECRET'];
  const missing = required.filter(name => !String(process.env[name] || '').trim());
  if (missing.length) {
    console.error(`CRITICAL ERROR: production configuration is invalid (missing ${missing.join(', ')}).`);
    process.exit(1);
  }
  app.set('trust proxy', 1);
}

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Lightweight health-check endpoint for UptimeRobot / cron monitoring services (keeps Render free-tier alive)
app.get(['/health', '/api/health', '/healthz'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'VandeCRM',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});
app.head(['/health', '/api/health', '/healthz'], (req, res) => res.status(200).end());

// ============================================
// API ROUTES (JSON)
// /api/auth is public (login/signup/me/switch-company).
// Each domain route file self-guards with its own JWT auth/permission checks
// (see api/middleware/auth.js: requireApiAuth / requireApiPermission).
// Do NOT add EJS session/role middleware here — these are JSON API routes.
// ============================================
app.use('/api/auth', apiAuth);
app.use('/api/dashboard', apiDashboard);
app.use('/api/customers', apiCustomers);
app.use('/api/clients', apiClients);
app.use('/api/campaigns', apiCampaigns);
app.use('/api/work', apiWork);
app.use('/api/team', apiTeam);
app.use('/api/settings', apiSettings);
app.use('/api/companies', apiCompanies);
app.use('/api/follow-ups', apiFollowUps);
app.use('/api/notifications', apiNotifications);
app.use('/api/mail', apiMail);
app.use('/api/integrations', apiIntegrations);
app.use('/api/audit', apiAudit);
app.use('/api/search', apiSearch);
app.use('/api/portfolio', apiPortfolio);
app.use('/api/analytics', apiAnalytics);
app.use('/api/reports', apiReports);
app.use('/api/client-dashboard', apiClientDashboard);
app.use('/api', require('./routes/api'));

// ============================================
// SERVE REACT BUILD (production)
// ============================================
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(clientBuild, 'index.html'));
    }
  });
}

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'API endpoint not found' }));

// Error handler (JSON for API paths)
app.use((err, req, res, next) => {
  console.error(err);
  const status = Number(err.status) || 500;
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message });
  }
  res.status(status).json({ ok: false, error: 'Server error' });
});

async function startServer() {
  await connectDb();
  await ensureCrmIndexes();
  await syncWorkTypeDefaults();
  await syncWorkspaceSeedData();
  const { startIntegrationScheduler } = require('./services/integrationSync');
  const { startDeadlineScheduler } = require('./services/deadlineAlerts');
  startIntegrationScheduler();
  startDeadlineScheduler();
  app.listen(port, '0.0.0.0', () => {
    console.log(`CRM API running on http://0.0.0.0:${port}`);
    console.log(`API available at http://0.0.0.0:${port}/api`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
