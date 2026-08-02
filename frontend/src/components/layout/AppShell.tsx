import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { Stars } from '@/components/Stars';
import { Sidebar } from './Sidebar';
import { ToastContainer } from './ToastContainer';
import './AppShell.css';

export function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Stars />
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="app-shell">
        {/* Mobile top bar */}
        <header className="mobile-topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="mobile-brand">
            Tally<span>.</span>
          </div>
        </header>

        {/* Off-canvas backdrop (mobile only) */}
        {sidebarOpen && (
          <div
            className="sidebar-backdrop backdrop-enter"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar />

        <main className="app-main" id="main-content">
          <div key={location.pathname} className="page-transition page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastContainer />
    </>
  );
}
