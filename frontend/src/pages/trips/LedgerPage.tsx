import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTrip } from '@/hooks/useTrips';
import { useMemberLedger } from '@/hooks/useLedger';
import { useAuthStore } from '@/store/auth.store';
import { GlassCard } from '@/components/common/GlassCard';
import { Avatar } from '@/components/common/Avatar';
import { MonoAmount } from '@/components/common/MonoAmount';
import { QueryErrorState } from '@/components/common/QueryErrorState';
import { formatDate, eventTypeLabel, categoryIcon } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { MemberLedgerEntry } from '@/api/types';
import './LedgerPage.css';

export function LedgerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  useDocumentTitle('Member Ledger');
  const user = useAuthStore((s) => s.user);
  const { data: trip } = useTrip(tripId ?? null);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Default to the current user's member row (computed before hooks below)
  const activeMemberId =
    selectedMemberId ??
    trip?.members.find((m) => m.userId === user?.id)?.id ??
    trip?.members[0]?.id ??
    null;

  const { data: ledger, isLoading, isError, refetch } = useMemberLedger(tripId ?? '', activeMemberId ?? '');

  if (!tripId) return <Navigate to="/trips" replace />;

  const activeMember = trip?.members.find((m) => m.id === activeMemberId);

  return (
    <div className="ledger-page">
      <div className="ledger-header">
        <div>
          <h1 className="ledger-title">Member Ledger</h1>
          <p className="ledger-sub">
            Every money movement for one person, in order, with the running total
          </p>
        </div>
      </div>

      {/* Member selector */}
      {trip && (
        <div className="ledger-members">
          {trip.members.map((m) => {
            const isActive = m.id === activeMemberId;
            return (
              <button
                key={m.id}
                className={`ledger-member-chip ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedMemberId(m.id)}
              >
                <Avatar name={m.user.name} size="sm" />
                <span>{m.user.name.split(' ')[0]}</span>
                {isActive && <span className="ledger-member-check">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Summary strip */}
      {ledger && (
        <div className="ledger-summary">
          <GlassCard className="ledger-summary-card">
            <span className="ledger-summary-label">Current position</span>
            <MonoAmount value={ledger.currentBalance} asBalance size="22px" />
            <span className="ledger-summary-sub">
              {ledger.currentBalance > 0
                ? `${ledger.userName} should receive this`
                : ledger.currentBalance < 0
                ? `${ledger.userName} owes this`
                : 'All settled up'}
            </span>
          </GlassCard>
          <GlassCard className="ledger-summary-card">
            <span className="ledger-summary-label">Activity</span>
            <span className="ledger-summary-count">{ledger.total}</span>
            <span className="ledger-summary-sub">
              {ledger.total === 1 ? 'money movement' : 'money movements'}
            </span>
          </GlassCard>
        </div>
      )}

      {/* Entries */}
      <GlassCard className="ledger-list">
        {isLoading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : isError ? (
          <QueryErrorState
            message="We could not load this member's ledger."
            onRetry={() => refetch()}
          />
        ) : !ledger || ledger.items.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 0' }}>
            <div className="empty-state-icon" aria-hidden="true">🪙</div>
            <div className="empty-state-title">No activity yet</div>
            <div className="empty-state-desc">
              {activeMember
                ? `${activeMember.user.name} hasn't been part of any money movement yet.`
                : 'This member has no history yet.'}
            </div>
          </div>
        ) : (
          ledger.items.map((entry, idx) => (
            <LedgerRow key={entry.entryId} entry={entry} index={idx} />
          ))
        )}
      </GlassCard>
    </div>
  );
}

function LedgerRow({ entry, index }: { entry: MemberLedgerEntry; index: number }) {
  const event = entry.businessEvent;
  const isInflow = entry.amount > 0;

  return (
    <motion.div
      className="ledger-row"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.22, ease: 'easeOut' }}
    >
      <div className="ledger-icon" aria-hidden="true">{categoryIcon(event.category)}</div>
      <div className="ledger-main">
        <div className="ledger-row-title">
          {event.notes || eventTypeLabel(event.type)}
        </div>
        <div className="ledger-row-meta">
          <span className="badge" style={{ fontSize: 11, marginRight: 6 }}>
            {eventTypeLabel(event.type)}
          </span>
          {event.category && (
            <span className="ledger-row-meta-text">{event.category} · </span>
          )}
          <span className="ledger-row-meta-text">
            by {event.createdBy?.name ?? 'Unknown'} · {formatDate(event.createdAt)}
          </span>
        </div>
      </div>
      <div className="ledger-amounts">
        <MonoAmount
          value={entry.amount}
          asBalance
          className="ledger-row-amount"
          size="14px"
        />
        <span className={`ledger-running ${isInflow ? 'positive' : 'negative'}`}>
          running {formatSigned(entry.runningBalance)}
        </span>
      </div>
    </motion.div>
  );
}

function formatSigned(minorUnits: number): string {
  const major = Math.abs(minorUnits) / 100;
  const prefix = minorUnits >= 0 ? '+Rs ' : '−Rs ';
  return `${prefix}${major.toLocaleString('en-IN')}`;
}
