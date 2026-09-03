import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import CustomersPage from './pages/customers/CustomersPage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import CustomerFormPage from './pages/customers/CustomerFormPage';
import CompaniesPage from './pages/companies/CompaniesPage';
import CompanyDetailPage from './pages/companies/CompanyDetailPage';
import CampaignsPage from './pages/campaigns/CampaignsPage';
import CampaignDetailPage from './pages/campaigns/CampaignDetailPage';

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
      <BrowserRouter>
        <Routes>
          <Route element={<GuestRoute><AuthLayout /></GuestRoute>}>
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/signup" element={<div>Signup — TODO</div>} />
          </Route>
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/new" element={<CustomerFormPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/clients" element={<div>Clients — TODO</div>} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/work" element={<div>Work Center — TODO</div>} />
            <Route path="/work/:type" element={<div>Work List — TODO</div>} />
            <Route path="/work/:type/:id" element={<div>Work Detail — TODO</div>} />
            <Route path="/team" element={<div>Team — TODO</div>} />
            <Route path="/settings" element={<div>Settings — TODO</div>} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/tasks" element={<div>Tasks — TODO</div>} />
            <Route path="/mail" element={<div>Mail — TODO</div>} />
            <Route path="/integrations" element={<div>Integrations — TODO</div>} />
            <Route path="/audit" element={<div>Audit — TODO</div>} />
            <Route path="/search" element={<div>Search — TODO</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
