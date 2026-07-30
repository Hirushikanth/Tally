import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { Stars } from '@/components/Stars';
import { Sidebar } from './Sidebar';
import { ToastContainer } from './ToastContainer';
import './AppShell.css';

export function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Stars />
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </>
  );
}
