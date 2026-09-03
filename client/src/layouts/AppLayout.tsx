import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';

export default function AppLayout() {
  const { user, activeCompany, companies, crmTerms, workTypes, switchCompany, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user) {
    navigate('/auth/login');
    return null;
  }

  return (
    <div className={`app-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <Sidebar
        user={user}
        activeCompany={activeCompany}
        workTypes={workTypes}
        crmTerms={crmTerms}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        currentPath={location.pathname}
      />
      <div className="main-content">
        <TopBar
          user={user}
          activeCompany={activeCompany}
          companies={companies}
          onSwitchCompany={switchCompany}
        />
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
