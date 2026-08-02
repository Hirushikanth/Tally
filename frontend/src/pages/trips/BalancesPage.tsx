import { useParams, Navigate } from 'react-router';
import { useBalances } from '@/hooks/useLedger';
import { useSuggestions } from '@/hooks/useSettlements';
import { useTrip } from '@/hooks/useTrips';
import { useCreateCashMovement } from '@/hooks/useEvents';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { GlassCard } from '@/components/common/GlassCard';
import { Avatar } from '@/components/common/Avatar';
import { MonoAmount } from '@/components/common/MonoAmount';
import { Button } from '@/components/common/Button';
import { QueryErrorState } from '@/components/common/QueryErrorState';
import { getApiErrorMessage } from '@/api/errors';
import { formatAmount } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { SuggestedSettlement } from '@/api/types';
import './BalancesPage.css';

export function BalancesPage() {
  const { tripId } = useParams<{ tripId: string }>();
  useDocumentTitle('Trip Balances');
  const user = useAuthStore((s) => s.user);
  const addToast = useUIStore((s) => s.addToast);

  const { data: trip } = useTrip(tripId ?? null);
  const { data: balancesData, isLoading: balancesLoading, isError: balancesError, refetch: refetchBalances } = useBalances(tripId ?? null);
  const { data: suggestionsData, isLoading: suggestionsLoading, isError: suggestionsError, refetch: refetchSuggestions } = useSuggestions(tripId ?? null);
  const createCashMovement = useCreateCashMovement(tripId ?? '');

  if (!tripId) return <Navigate to="/trips" replace />;

  const currency = trip?.currency ?? 'LKR';

  const handleSettle = async (s: SuggestedSettlement) => {
    try {
      await createCashMovement.mutateAsync({
        cashPayerMemberId: s.fromMemberId,
        cashReceiverMemberId: s.toMemberId,
        amount: s.amount,
        type: 'SETTLEMENT',
        notes: `Settlement: ${s.fromMemberName} → ${s.toMemberName}`,
      });
      addToast({
        message: `Recorded settlement of ${formatAmount(s.amount, currency)}`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: getApiErrorMessage(err, 'Failed to record settlement'),
        type: 'error',
      });
    }
  };

  return (
    <div className="balances-page">
      <div className="balances-header">
        <div>
          <h1 className="balances-title">Trip Balances</h1>
          <p className="balances-sub">
            Live net positions and simplified settlement recommendations for {trip?.name ?? '…'}
          </p>
        </div>
      </div>

      <div className="balances-grid">
        {/* Live Net Positions */}
        <GlassCard className="balances-panel">
          <div className="panel-header">
            <h3 className="panel-title">Member Positions</h3>
            <span className="panel-tag">Live net</span>
          </div>

          {balancesLoading ? (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : balancesError ? (
            <QueryErrorState
              message="We could not load member balances."
              onRetry={() => refetchBalances()}
            />
          ) : (
            <div className="positions-list">
              {balancesData?.balances.map((b, idx) => {
                const isMe = b.userId === user?.id;
                return (
                  <div
                    key={b.memberId}
                    className="position-card enter-fade-up"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="position-user">
                      <Avatar name={b.userName} size="md" />
                      <div>
                        <div className="position-name">
                          {b.userName} {isMe && <span className="you-tag">(You)</span>}
                        </div>
                        <div className="position-role">{b.role}</div>
                      </div>
                    </div>

                    <div className="position-amount">
                      <div className="position-status">
                        {b.balance > 0 ? 'Should receive' : b.balance < 0 ? 'Owes' : 'Settled up'}
                      </div>
                      <MonoAmount value={b.balance} asBalance size="16px" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* Debt Simplification Suggestions */}
        <GlassCard className="balances-panel">
          <div className="panel-header">
            <h3 className="panel-title">Suggested Settlements</h3>
            <span className="panel-tag">Min cash flow</span>
          </div>

          <p className="suggestions-explanation">
            Recommended minimal transfers to balance all debts with the fewest transactions.
          </p>

          {suggestionsLoading ? (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : suggestionsError ? (
            <QueryErrorState
              message="We could not load settlement suggestions."
              onRetry={() => refetchSuggestions()}
            />
          ) : suggestionsData?.suggestedSettlements.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="empty-state-icon" aria-hidden="true">🎉</div>
              <div className="empty-state-title">All settled up!</div>
              <div className="empty-state-desc">
                Nobody owes anything in this trip right now.
              </div>
            </div>
          ) : (
            <div className="suggestions-list">
              {suggestionsData?.suggestedSettlements.map((s, idx) => (
                <div
                  key={idx}
                  className="suggestion-card enter-fade-up"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="suggestion-flow">
                    <div className="suggestion-person">
                      <Avatar name={s.fromMemberName} size="sm" />
                      <span>{s.fromMemberName.split(' ')[0]}</span>
                    </div>
                    <div className="suggestion-arrow">
                      <span className="suggestion-arrow-line" />
                      <MonoAmount value={s.amount} currency={currency} className="suggestion-amount" />
                      <span className="suggestion-arrow-head" aria-hidden="true">➔</span>
                    </div>
                    <div className="suggestion-person">
                      <Avatar name={s.toMemberName} size="sm" />
                      <span>{s.toMemberName.split(' ')[0]}</span>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    loading={createCashMovement.isPending}
                    onClick={() => handleSettle(s)}
                  >
                    Record settlement
                  </Button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
