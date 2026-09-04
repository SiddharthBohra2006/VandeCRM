import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import CustomersPage from './pages/customers/CustomersPage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import CustomerFormPage from './pages/customers/CustomerFormPage';
import DuplicatesPage from './pages/customers/DuplicatesPage';
import ClientsPage from './pages/clients/ClientsPage';
import CompaniesPage from './pages/companies/CompaniesPage';
import CompanyDetailPage from './pages/companies/CompanyDetailPage';
import CampaignsPage from './pages/campaigns/CampaignsPage';
import CampaignDetailPage from './pages/campaigns/CampaignDetailPage';
import WorkCenterPage from './pages/work/WorkCenterPage';
import WorkListPage from './pages/work/WorkListPage';
import WorkDetailPage from './pages/work/WorkDetailPage';
import TasksPage from './pages/tasks/TasksPage';
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
  const { token } = useAuth();
  if (!token) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (token) return <Navigate to="/" replace />;
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
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/new" element={<CustomerFormPage />} />
            <Route path="/customers/duplicates" element={<DuplicatesPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/client-dashboard" element={<ClientDashboardPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/work" element={<WorkCenterPage />} />
            <Route path="/work/:type" element={<WorkListPage />} />
            <Route path="/work/:type/:id" element={<WorkDetailPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings/setup" element={<SetupPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/mail" element={<MailPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/reports" element={<ReportsIndexPage />} />
            <Route path="/reports/module-builder" element={<ModuleReportBuilderPage />} />
            <Route path="/reports/:reportKey" element={<ReportTablePage />} />
            <Route path="/403" element={<ForbiddenPage />} />
            <Route path="/500" element={<ServerErrorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
