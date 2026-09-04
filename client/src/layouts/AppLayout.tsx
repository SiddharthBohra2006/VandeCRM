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
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close the mobile drawer on route selection (matches sidebar overlay behavior)
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close the mobile drawer on Escape / backdrop click
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

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
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'show' : ''}`}
        onClick={() => setMobileOpen(false)}
      />
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
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={`main-wrap ${sidebarOpen ? '' : 'expanded'}`}>
        <TopBar
          user={user}
          activeCompany={activeCompany}
          companies={companies}
          onSwitchCompany={switchCompany}
          onToggleMobile={() => setMobileOpen(v => !v)}
        />
        <div className="page-content">
          <Outlet key={activeCompany?._id || 'default'} />
        </div>
      </div>
    </div>
  );
}
