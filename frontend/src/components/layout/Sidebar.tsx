import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useTrips } from '@/hooks/useTrips';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { Avatar } from '@/components/common/Avatar';
import './Sidebar.css';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '', icon: '◈', end: true },
  { label: 'All Expenses', path: 'expenses', icon: '≡' },
  { label: 'Balances', path: 'balances', icon: '⚖' },
  { label: 'Ledger', path: 'ledger', icon: '▤' },
  { label: 'Settle Up', path: 'settle', icon: '✓' },
];

export function Sidebar() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { data: trips } = useTrips();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setNewTripModalOpen = useUIStore((s) => s.setNewTripModalOpen);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">T</div>
        <div className="sidebar-brand-name">
          Tally<span className="sidebar-brand-dot">.</span>
        </div>
      </div>

      {/* Navigation — only shown when inside a trip */}
      {tripId && (
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.label}
              to={item.end ? `/trips/${tripId}` : `/trips/${tripId}/${item.path}`}
              end={item.end}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}

      {/* Trip list */}
      <div className="sidebar-trips">
        <div className="sidebar-section-label">Trips</div>
        <div className="sidebar-trip-list">
          {trips?.map((trip) => {
            const totalEvents = trip._count?.businessEvents ?? 0;
            return (
              <button
                key={trip.id}
                className={`sidebar-trip-chip ${trip.id === tripId ? 'active' : ''}`}
                onClick={() => navigate(`/trips/${trip.id}`)}
              >
                <span className="sidebar-trip-name">{trip.name}</span>
                <span className="sidebar-trip-meta">
                  {totalEvents > 0 ? `${totalEvents} exp` : trip.currency}
                </span>
              </button>
            );
          })}
          <button
            className="sidebar-trip-chip new-trip"
            onClick={() => setNewTripModalOpen(true)}
          >
            <span>+ New trip</span>
          </button>
        </div>
      </div>

      {/* Footer: user info + logout */}
      <div className="sidebar-footer">
        {user && (
          <>
            <Avatar name={user.name} size="md" />
            <div className="sidebar-user">
              <div className="sidebar-user-name">{user.name}</div>
              <div className="sidebar-user-email">{user.email}</div>
            </div>
          </>
        )}
        <button className="sidebar-logout" onClick={handleLogout} title="Sign out">
          ⏻
        </button>
      </div>
    </aside>
  );
}
