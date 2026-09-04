import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';

export default function AppLayout() {
  const { user, activeCompany, companies, crmTerms, workTypes, switchCompany, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('vande_sidebar_open');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const navigate = useNavigate();
  const location = useLocation();

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem('vande_sidebar_open', String(next));
      } catch {
        // ignore localStorage errors
      }
      return next;
    });
  };

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user) {
    navigate('/auth/login');
    return null;
  }

  return (
    <div className="app-layout">
      <Sidebar
        user={user}
        activeCompany={activeCompany}
        companies={companies}
        workTypes={workTypes}
        crmTerms={crmTerms}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        onSwitchCompany={switchCompany}
        currentPath={location.pathname}
      />
      <div className={`main-wrap ${sidebarOpen ? '' : 'expanded'}`}>
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
