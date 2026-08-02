import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';

const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('@/pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const TripsListPage = lazy(() =>
  import('@/pages/trips/TripsListPage').then((m) => ({ default: m.TripsListPage })),
);
const TripDashboardPage = lazy(() =>
  import('@/pages/trips/TripDashboardPage').then((m) => ({
    default: m.TripDashboardPage,
  })),
);
const ExpensesPage = lazy(() =>
  import('@/pages/trips/ExpensesPage').then((m) => ({ default: m.ExpensesPage })),
);
const BalancesPage = lazy(() =>
  import('@/pages/trips/BalancesPage').then((m) => ({ default: m.BalancesPage })),
);
const LedgerPage = lazy(() =>
  import('@/pages/trips/LedgerPage').then((m) => ({ default: m.LedgerPage })),
);

function PageFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <div className="spinner spinner-lg" />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes inside AppShell */}
        <Route element={<AppShell />}>
          <Route path="/trips" element={<TripsListPage />} />
          <Route path="/trips/:tripId" element={<TripDashboardPage />} />
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
          <Route path="/trips/:tripId/balances" element={<BalancesPage />} />
          <Route path="/trips/:tripId/ledger" element={<LedgerPage />} />
          <Route path="/trips/:tripId/settle" element={<BalancesPage />} />
        </Route>

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/trips" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
