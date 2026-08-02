import { useParams, Navigate } from 'react-router-dom';
import { useInfiniteEvents } from '@/hooks/useEvents';
import { useTrip } from '@/hooks/useTrips';
import { MonoAmount } from '@/components/common/MonoAmount';
import { GlassCard } from '@/components/common/GlassCard';
import { Button } from '@/components/common/Button';
import { QueryErrorState } from '@/components/common/QueryErrorState';
import { useUIStore } from '@/store/ui.store';
import { categoryIcon, eventTypeLabel, formatDate } from '@/lib/utils';
import { AddExpenseModal } from './modals/AddExpenseModal';
import { AddLoanModal } from './modals/AddLoanModal';
import { AddCashMovementModal } from './modals/AddCashMovementModal';
import { useAuthStore } from '@/store/auth.store';
import './ExpensesPage.css';

export function ExpensesPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const user = useAuthStore((s) => s.user);
  const { data: trip } = useTrip(tripId ?? null);
  const {
    data: eventsData,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteEvents(tripId ?? null);
  const addExpenseModalOpen = useUIStore((s) => s.addExpenseModalOpen);
  const setAddExpenseModalOpen = useUIStore((s) => s.setAddExpenseModalOpen);
  const addLoanModalOpen = useUIStore((s) => s.addLoanModalOpen);
  const setAddLoanModalOpen = useUIStore((s) => s.setAddLoanModalOpen);
  const addCashMovementModalOpen = useUIStore((s) => s.addCashMovementModalOpen);
  const setAddCashMovementModalOpen = useUIStore((s) => s.setAddCashMovementModalOpen);

  if (!tripId) return <Navigate to="/trips" replace />;

  const myMember = trip?.members.find((m) => m.userId === user?.id);

  const events = eventsData?.pages.flatMap((page) => page.items) ?? [];
  const totalEvents = eventsData?.pages[0]?.total ?? 0;

  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="expenses-page">
      <div className="expenses-header">
        <div>
          <h1 className="expenses-title">All Expenses</h1>
          <p className="expenses-sub">
            {totalEvents} expense{totalEvents !== 1 ? 's' : ''} in {trip?.name ?? '…'}
          </p>
        </div>
        <div className="expenses-actions">
          <Button onClick={() => setAddLoanModalOpen(true)}>💸 Loan</Button>
          <Button onClick={() => setAddCashMovementModalOpen(true)}>✓ Record payment</Button>
          <Button variant="primary" onClick={() => setAddExpenseModalOpen(true)}>
            + Add expense
          </Button>
        </div>
      </div>

      <GlassCard className="expenses-list">
        {isLoading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : isError ? (
          <QueryErrorState
            message="We could not load expenses for this trip."
            onRetry={() => refetch()}
          />
        ) : sortedEvents.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 0' }}>
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-title">No expenses yet</div>
            <div className="empty-state-desc">
              Add your first expense to start tracking this trip's spending.
            </div>
            <Button variant="primary" onClick={() => setAddExpenseModalOpen(true)}>
              + Add expense
            </Button>
          </div>
        ) : (
          <>
            {sortedEvents.map((event) => (
              <div key={event.id} className="expenses-row">
                <div className="expenses-icon">{categoryIcon(event.category)}</div>
                <div className="expenses-main">
                  <div className="expenses-row-title">
                    {event.notes || eventTypeLabel(event.type)}
                  </div>
                  <div className="expenses-row-meta">
                    {event.category && (
                      <span className="badge" style={{ fontSize: 11, marginRight: 6 }}>
                        {event.category}
                      </span>
                    )}
                    <span>{eventTypeLabel(event.type)}</span>
                    <span className="expenses-sep">·</span>
                    <span>by {event.createdBy?.name ?? 'Unknown'}</span>
                    <span className="expenses-sep">·</span>
                    <span>{formatDate(event.createdAt)}</span>
                  </div>
                </div>
                <MonoAmount value={event.amount} currency={trip?.currency ?? 'LKR'} />
              </div>
            ))}
            {hasNextPage && (
              <div className="expenses-load-more">
                <Button
                  variant="ghost"
                  fullWidth
                  loading={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </GlassCard>

      <AddExpenseModal
        open={addExpenseModalOpen && !!myMember && !!trip}
        tripId={tripId}
        members={trip?.members ?? []}
        currency={trip?.currency ?? 'LKR'}
        currentMemberId={myMember?.id ?? ''}
        onClose={() => setAddExpenseModalOpen(false)}
      />

      <AddLoanModal
        open={addLoanModalOpen && !!myMember && !!trip}
        tripId={tripId}
        members={trip?.members ?? []}
        currency={trip?.currency ?? 'LKR'}
        currentMemberId={myMember?.id ?? ''}
        onClose={() => setAddLoanModalOpen(false)}
      />

      <AddCashMovementModal
        open={addCashMovementModalOpen && !!myMember && !!trip}
        tripId={tripId}
        members={trip?.members ?? []}
        currency={trip?.currency ?? 'LKR'}
        currentMemberId={myMember?.id ?? ''}
        onClose={() => setAddCashMovementModalOpen(false)}
      />
    </div>
  );
}
