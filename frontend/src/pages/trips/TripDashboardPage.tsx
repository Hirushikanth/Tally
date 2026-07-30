import { useParams, Navigate } from 'react-router-dom';
import { useTrip } from '@/hooks/useTrips';
import { useEvents } from '@/hooks/useEvents';
import { useBalances } from '@/hooks/useLedger';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { Button } from '@/components/common/Button';
import { GlassCard } from '@/components/common/GlassCard';
import { Avatar } from '@/components/common/Avatar';
import { MonoAmount } from '@/components/common/MonoAmount';
import { AddExpenseModal } from './modals/AddExpenseModal';
import { AddMemberModal } from './modals/AddMemberModal';
import { formatAmount, formatBalance, categoryIcon, eventTypeLabel, formatDate } from '@/lib/utils';
import type { BusinessEvent, MemberBalanceDto } from '@/api/types';
import './TripDashboardPage.css';

export function TripDashboardPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const user = useAuthStore((s) => s.user);
  const setAddExpenseModalOpen = useUIStore((s) => s.setAddExpenseModalOpen);
  const setAddMemberModalOpen = useUIStore((s) => s.setAddMemberModalOpen);
  const addExpenseModalOpen = useUIStore((s) => s.addExpenseModalOpen);
  const addMemberModalOpen = useUIStore((s) => s.addMemberModalOpen);

  const { data: trip, isLoading: tripLoading } = useTrip(tripId ?? null);
  const { data: events, isLoading: eventsLoading } = useEvents(tripId ?? null);
  const { data: balancesData } = useBalances(tripId ?? null);

  if (!tripId) return <Navigate to="/trips" replace />;

  if (tripLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!trip) {
    return <Navigate to="/trips" replace />;
  }

  // Find the current user's member record
  const myMember = trip.members.find((m) => m.userId === user?.id);
  const myBalance = balancesData?.balances.find((b) => b.userId === user?.id);
  const totalSpent = events?.reduce((sum, e) => sum + e.amount, 0) ?? 0;

  // Category breakdown from events
  const categoryTotals = buildCategoryTotals(events ?? []);
  const maxCategory = Math.max(...Object.values(categoryTotals), 1);

  // Recent events (last 5)
  const recentEvents = [...(events ?? [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const memberCount = trip.members.length;

  return (
    <div className="dashboard">
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div>
          <h1 className="dashboard-title">{trip.name}</h1>
          <div className="dashboard-sub">
            {memberCount} traveler{memberCount !== 1 ? 's' : ''}
            {trip.description && (
              <>
                <span className="dashboard-sep">·</span>
                <span>{trip.description}</span>
              </>
            )}
            <span className="dashboard-sep">·</span>
            <span style={{ color: 'var(--text-low)' }}>{trip.currency}</span>
          </div>
        </div>
        <div className="dashboard-actions">
          <Button onClick={() => setAddMemberModalOpen(true)}>
            👤 Add member
          </Button>
          <Button variant="primary" onClick={() => setAddExpenseModalOpen(true)}>
            + Add expense
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="dashboard-stats">
        <StatCard
          label="Total spent"
          value={formatAmount(totalSpent, trip.currency)}
          valueClass="gold"
          delta={`${trip._count?.businessEvents ?? 0} expenses recorded`}
        />
        <StatCard
          label="Your share"
          value={myBalance ? formatAmount(Math.abs(myBalance.balance), trip.currency) : '—'}
          delta={myBalance
            ? myBalance.balance >= 0
              ? '✓ You are owed this'
              : 'You owe this'
            : 'No activity yet'}
          deltaClass={myBalance?.balance && myBalance.balance >= 0 ? 'positive' : undefined}
        />
        <StatCard
          label={myBalance?.balance && myBalance.balance > 0 ? 'You are owed' : 'You owe'}
          value={myBalance ? formatBalance(myBalance.balance) : '—'}
          valueClass={myBalance?.balance && myBalance.balance >= 0 ? 'green' : 'red'}
          delta={`from ${memberCount - 1} other traveler${memberCount !== 2 ? 's' : ''}`}
        />
        <StatCard
          label="Members"
          value={String(memberCount)}
          delta={trip.members.slice(0, 3).map((m) => m.user.name.split(' ')[0]).join(', ')}
        />
      </div>

      {/* Content grid */}
      <div className="dashboard-grid">
        {/* Recent expenses panel */}
        <GlassCard className="dashboard-panel">
          <div className="panel-header">
            <h3 className="panel-title">Recent expenses</h3>
            <span className="panel-tag">{events?.length ?? 0} total</span>
          </div>
          {eventsLoading ? (
            <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : recentEvents.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="empty-state-icon">🧾</div>
              <div className="empty-state-title">No expenses yet</div>
              <div className="empty-state-desc">Add your first expense to start tracking.</div>
            </div>
          ) : (
            recentEvents.map((event) => (
              <ExpenseRow key={event.id} event={event} currency={trip.currency} />
            ))
          )}
        </GlassCard>

        {/* Right column */}
        <div className="dashboard-right">
          {/* Category breakdown */}
          <GlassCard className="dashboard-panel">
            <div className="panel-header">
              <h3 className="panel-title">By category</h3>
            </div>
            {Object.keys(categoryTotals).length === 0 ? (
              <p style={{ color: 'var(--text-low)', fontSize: 13, padding: '8px 0' }}>
                No categorized expenses yet
              </p>
            ) : (
              Object.entries(categoryTotals)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, total]) => (
                  <div key={cat} className="cat-bar">
                    <div className="cat-bar-top">
                      <span className="cat-bar-name">{cat}</span>
                      <span className="cat-bar-value">
                        <MonoAmount value={total} currency={trip.currency} />
                      </span>
                    </div>
                    <div className="cat-bar-track">
                      <div
                        className="cat-bar-fill"
                        style={{ width: `${(total / maxCategory) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
            )}
          </GlassCard>

          {/* Balances panel */}
          <GlassCard className="dashboard-panel">
            <div className="panel-header">
              <h3 className="panel-title">Balances</h3>
            </div>
            {balancesData?.balances.map((b) => (
              <BalanceRow key={b.memberId} balance={b} currentUserId={user?.id} />
            ))}
            {(!balancesData || balancesData.balances.length === 0) && (
              <p style={{ color: 'var(--text-low)', fontSize: 13, padding: '8px 0' }}>
                No balances yet
              </p>
            )}
            <button
              className="settle-btn"
              onClick={() => setAddExpenseModalOpen(false)}
            >
              Settle up →
            </button>
          </GlassCard>
        </div>
      </div>

      {/* Modals */}
      {addExpenseModalOpen && myMember && (
        <AddExpenseModal
          tripId={tripId}
          members={trip.members}
          currency={trip.currency}
          currentMemberId={myMember.id}
          onClose={() => setAddExpenseModalOpen(false)}
        />
      )}

      {addMemberModalOpen && (
        <AddMemberModal
          tripId={tripId}
          onClose={() => setAddMemberModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

function StatCard({
  label,
  value,
  valueClass,
  delta,
  deltaClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
  delta?: string;
  deltaClass?: string;
}) {
  return (
    <GlassCard className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${valueClass ? `stat-value--${valueClass}` : ''}`}>
        {value}
      </div>
      {delta && (
        <div className={`stat-delta ${deltaClass ? `stat-delta--${deltaClass}` : ''}`}>
          {delta}
        </div>
      )}
    </GlassCard>
  );
}

function ExpenseRow({ event, currency }: { event: BusinessEvent; currency: string }) {
  const icon = categoryIcon(event.category);
  const paidBy = event.createdBy?.name ?? 'Unknown';

  return (
    <div className="expense-row">
      <div className="expense-icon">{icon}</div>
      <div className="expense-main">
        <div className="expense-title">
          {event.notes || eventTypeLabel(event.type)}
        </div>
        <div className="expense-meta">
          {event.category && <span>{event.category} · </span>}
          paid by {paidBy} · {formatDate(event.createdAt)}
        </div>
      </div>
      <div className="expense-type-badge">
        <span className="badge" style={{ fontSize: 11 }}>
          {eventTypeLabel(event.type)}
        </span>
      </div>
      <div className="expense-amount">
        <MonoAmount value={event.amount} currency={currency} />
      </div>
    </div>
  );
}

function BalanceRow({
  balance,
  currentUserId,
}: {
  balance: MemberBalanceDto;
  currentUserId?: string;
}) {
  const isMe = balance.userId === currentUserId;
  return (
    <div className="balance-row">
      <div className="balance-who">
        <Avatar name={balance.userName} size="sm" />
        <span>
          {isMe ? 'You' : balance.userName}
          {balance.balance >= 0
            ? ' · owed'
            : ' · owes'}
        </span>
      </div>
      <MonoAmount value={balance.balance} asBalance />
    </div>
  );
}

function buildCategoryTotals(events: BusinessEvent[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const event of events) {
    const cat = event.category ?? 'Other';
    totals[cat] = (totals[cat] ?? 0) + event.amount;
  }
  return totals;
}
