import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import { hasPermission } from './utils/permissions';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import CustomersPage from './pages/customers/CustomersPage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import CustomerFormPage from './pages/customers/CustomerFormPage';
import DuplicatesPage from './pages/customers/DuplicatesPage';
import CustomerImportPage from './pages/customers/CustomerImportPage';
import CustomerImportPreviewPage from './pages/customers/CustomerImportPreviewPage';
import CustomerImportResultsPage from './pages/customers/CustomerImportResultsPage';
import WorkImportPreviewPage from './pages/work/WorkImportPreviewPage';
import ClientsPage from './pages/clients/ClientsPage';
import CompaniesPage from './pages/companies/CompaniesPage';
import CompanyDetailPage from './pages/companies/CompanyDetailPage';
import CampaignsPage from './pages/campaigns/CampaignsPage';
import CampaignDetailPage from './pages/campaigns/CampaignDetailPage';
import WorkCenterPage from './pages/work/WorkCenterPage';
import WorkListPage from './pages/work/WorkListPage';
import WorkDetailPage from './pages/work/WorkDetailPage';
import WorkThreadsPage from './pages/work/WorkThreadsPage';
import FollowUpsPage from './pages/follow-ups/FollowUpsPage';
import TeamPage from './pages/team/TeamPage';
import SettingsPage from './pages/settings/SettingsPage';
import SetupPage from './pages/settings/SetupPage';
import MailPage from './pages/mail/MailPage';
import IntegrationsPage from './pages/integrations/IntegrationsPage';
import AuditPage from './pages/audit/AuditPage';
import SearchPage from './pages/search/SearchPage';
import PortfolioPage from './pages/portfolio/PortfolioPage';
import AnalyticsPage from './pages/analytics/AnalyticsPage';
import ReportsIndexPage from './pages/reports/ReportsIndexPage';
import ReportTablePage from './pages/reports/ReportTablePage';
import ModuleReportBuilderPage from './pages/reports/ModuleReportBuilderPage';
import ClientDashboardPage from './pages/clients/ClientDashboardPage';
import NotFoundPage from './pages/errors/NotFoundPage';
import ForbiddenPage from './pages/errors/ForbiddenPage';
import ServerErrorPage from './pages/errors/ServerErrorPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user, loading, authBootError, refreshUser, logout } = useAuth();
  if (!token) return <Navigate to="/auth/login" replace />;
  if (loading) {
    return (
      <div className="loading-screen" aria-live="polite">Loading workspace......</div>
    );
  }
  if (!user) {
    return (
      <div className="boot-error-shell" role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'var(--bg, #090d16)', fontFamily: 'var(--font-display)' }}>
        <div style={{ maxWidth: 460, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={{ fontSize: '2rem' }}>📡</div>
          <h1 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text, #f8fafc)' }}>
            {authBootError ? 'Could not reach the server' : 'Session could not be restored'}
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted, #94a3b8)', lineHeight: 1.5 }}>
            {authBootError
              ? 'Your browser was unable to contact the server (offline or a temporary outage). Your sign-in is still valid — retry when you are back online.'
              : 'Please sign in again to continue.'}
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
            <button type="button" className="btn small primary" onClick={() => refreshUser()}>Retry</button>
            <button type="button" className="btn small outline" onClick={() => logout()}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function SessionExpiredModal() {
  const { sessionExpired, dismissSessionExpired, logout } = useAuth();
  const navigate = useNavigate();
  if (!sessionExpired) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460, background: 'var(--panel, #121b2d)', border: '1px solid rgba(212, 175, 55, 0.25)', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.4)', padding: '1.5rem' }}>
        <h3 id="session-expired-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontFamily: 'var(--font-display)', color: 'var(--text, #f8fafc)' }}>
          Your session has expired
        </h3>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--muted, #94a3b8)', lineHeight: 1.55 }}>
          Please copy any unsaved work on this page before continuing, then sign in again to pick up where you left off.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
          <button type="button" className="btn small outline" onClick={dismissSessionExpired}>Continue working</button>
          <button
            type="button"
            className="btn small primary"
            onClick={() => { logout(); navigate('/auth/login', { replace: true }); }}
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  );
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === 'client') return <Navigate to="/client-dashboard" replace />;
  return <DashboardPage />;
}

function ManagerRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!['admin', 'manager'].includes(user.role)) return <Navigate to="/403" replace />;
  return children;
}

// Route guard that mirrors the server permission engine, so URL/bookmark
// access to a page is blocked even when the sidebar link is hidden.
function PermissionRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!hasPermission(user, permission)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'admin') return <Navigate to="/403" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<GuestRoute><AuthLayout /></GuestRoute>}>
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/signup" element={<SignupPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          </Route>
          <Route element={<ProtectedRoute><SessionExpiredModal /><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/pipeline" element={<Navigate to="/?section=pipeline" replace />} />
            <Route path="/customers" element={<PermissionRoute permission="businesses.view"><CustomersPage /></PermissionRoute>} />
            <Route path="/customers/new" element={<PermissionRoute permission="businesses.view"><CustomerFormPage /></PermissionRoute>} />
            <Route path="/customers/duplicates" element={<PermissionRoute permission="businesses.view"><DuplicatesPage /></PermissionRoute>} />
            <Route path="/customers/import" element={<PermissionRoute permission="businesses.view"><CustomerImportPage /></PermissionRoute>} />
            <Route path="/customers/import/preview" element={<PermissionRoute permission="businesses.view"><CustomerImportPreviewPage /></PermissionRoute>} />
            <Route path="/customers/import/results" element={<PermissionRoute permission="businesses.view"><CustomerImportResultsPage /></PermissionRoute>} />
            <Route path="/customers/:id" element={<PermissionRoute permission="businesses.view"><CustomerDetailPage /></PermissionRoute>} />
            <Route path="/customers/:id/edit" element={<PermissionRoute permission="businesses.view"><CustomerFormPage /></PermissionRoute>} />
            <Route path="/clients" element={<PermissionRoute permission="businesses.view"><ClientsPage /></PermissionRoute>} />
            <Route path="/clients/new" element={<PermissionRoute permission="businesses.view"><CustomerFormPage /></PermissionRoute>} />
            <Route path="/clients/:id" element={<PermissionRoute permission="businesses.view"><CustomerDetailPage /></PermissionRoute>} />
            <Route path="/clients/:id/edit" element={<PermissionRoute permission="businesses.view"><CustomerFormPage /></PermissionRoute>} />
            <Route path="/client-dashboard" element={<ClientDashboardPage />} />
            <Route path="/campaigns" element={<PermissionRoute permission="ads.view"><CampaignsPage /></PermissionRoute>} />
            <Route path="/campaigns/:id" element={<PermissionRoute permission="ads.view"><CampaignDetailPage /></PermissionRoute>} />
            <Route path="/work" element={<WorkCenterPage />} />
            <Route path="/work/threads" element={<WorkThreadsPage />} />
            <Route path="/work/:type" element={<WorkListPage />} />
            <Route path="/work/:type/import/preview" element={<WorkImportPreviewPage />} />
            <Route path="/work/:type/:id" element={<WorkDetailPage />} />
            <Route path="/team" element={<PermissionRoute permission="team.view"><TeamPage /></PermissionRoute>} />
            <Route path="/settings/setup" element={<AdminRoute><SetupPage /></AdminRoute>} />
            <Route path="/settings" element={<PermissionRoute permission="settings.view"><SettingsPage /></PermissionRoute>} />
            <Route path="/companies" element={<PermissionRoute permission="businesses.view"><CompaniesPage /></PermissionRoute>} />
            <Route path="/companies/:id" element={<PermissionRoute permission="businesses.view"><CompanyDetailPage /></PermissionRoute>} />
            <Route path="/follow-ups" element={<PermissionRoute permission="tasks.view"><FollowUpsPage /></PermissionRoute>} />
            <Route path="/mail" element={<PermissionRoute permission="mail.view"><MailPage /></PermissionRoute>} />
            <Route path="/integrations" element={<ManagerRoute><IntegrationsPage /></ManagerRoute>} />
            <Route path="/audit" element={<PermissionRoute permission="audit.view"><AuditPage /></PermissionRoute>} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/analytics" element={<PermissionRoute permission="reports.view"><AnalyticsPage /></PermissionRoute>} />
            <Route path="/reports" element={<PermissionRoute permission="reports.view"><ReportsIndexPage /></PermissionRoute>} />
            <Route path="/reports/module-builder" element={<PermissionRoute permission="reports.view"><ModuleReportBuilderPage /></PermissionRoute>} />
            <Route path="/reports/:reportKey" element={<PermissionRoute permission="reports.view"><ReportTablePage /></PermissionRoute>} />
            <Route path="/403" element={<ForbiddenPage />} />
            <Route path="/500" element={<ServerErrorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
