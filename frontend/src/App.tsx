import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { TripsListPage } from '@/pages/trips/TripsListPage';
import { TripDashboardPage } from '@/pages/trips/TripDashboardPage';
import { ExpensesPage } from '@/pages/trips/ExpensesPage';
import { BalancesPage } from '@/pages/trips/BalancesPage';

export function App() {
  return (
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
        <Route path="/trips/:tripId/settle" element={<BalancesPage />} />
      </Route>

      {/* Default redirect */}
      <Route path="*" element={<Navigate to="/trips" replace />} />
    </Routes>
  );
}

export default App;
