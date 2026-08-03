import { useMemo } from 'react';
import { Modal } from '@/components/common/Modal';
import { Avatar } from '@/components/common/Avatar';
import { MonoAmount } from '@/components/common/MonoAmount';
import { categoryIcon, eventTypeLabel, formatDate, formatAmount } from '@/lib/utils';
import { buildBreakdown } from '@/lib/eventBreakdown';
import type {
  BusinessEvent,
  TripMember,
} from '@/api/types';
import './EventDetailsModal.css';

interface Props {
  open: boolean;
  event: BusinessEvent | null;
  currency: string;
  members: TripMember[];
  onClose: () => void;
}

export function EventDetailsModal({ open, event, currency, members, onClose }: Props) {
  const memberName = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.id, m.user.name);
    for (const p of event?.postings ?? []) {
      if (p.member?.user.name) map.set(p.memberId, p.member.user.name);
    }
    return (id: string) => map.get(id) ?? 'Unknown';
  }, [event, members]);

  if (!event) return null;

  const breakdown = buildBreakdown(event, currency);

  return (
    <Modal open={open} onClose={onClose} title={`${eventTypeLabel(event.type)} details`}>
      <div className="event-detail">
        {/* Header */}
        <div className="event-detail-head">
          <div className="event-detail-icon" aria-hidden="true">
            {categoryIcon(event.category)}
          </div>
          <div className="event-detail-main">
            <div className="event-detail-title">
              {event.notes || eventTypeLabel(event.type)}
            </div>
            <div className="event-detail-meta">
              <span className="badge" style={{ fontSize: 11, marginRight: 6 }}>
                {eventTypeLabel(event.type)}
              </span>
              {event.category && <span>{event.category} · </span>}
              <span>by {event.createdBy?.name ?? 'Unknown'} · {formatDate(event.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="event-detail-total">
          <MonoAmount value={event.amount} currency={currency} size="26px" />
          {breakdown.method && (
            <span className="event-detail-total-sub">
              {breakdown.method}
              {breakdown.subline ? ` — ${breakdown.subline}` : ''}
            </span>
          )}
        </div>

        {event.type === 'SHARED_EXPENSE' && (
          <SharedExpenseDetail event={event} memberName={memberName} currency={currency} />
        )}
        {event.type === 'LOAN' && (
          <FlowDetail event={event} memberName={memberName} currency={currency} flow="lent to" />
        )}
        {(event.type === 'REPAYMENT' || event.type === 'SETTLEMENT') && (
          <FlowDetail event={event} memberName={memberName} currency={currency} flow="paid" />
        )}
        {event.type === 'REFUND' && (
          <RefundDetail event={event} currency={currency} />
        )}
        {event.type === 'ADJUSTMENT' && (
          <AdjustmentDetail event={event} memberName={memberName} currency={currency} />
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Sub-panels per event type
// ---------------------------------------------------------------

function SharedExpenseDetail({
  event,
  memberName,
  currency,
}: {
  event: BusinessEvent;
  memberName: (id: string) => string;
  currency: string;
}) {
  const breakdown = buildBreakdown(event, currency);
  const rows = breakdown.people.map((row) => ({
    ...row,
    name: memberName(row.memberId),
  }));

  return (
    <div className="event-detail-section">
      <div className="event-detail-section-title">Paid by</div>
      {rows.filter((r) => r.paid > 0).length > 0 ? (
        <div className="event-detail-rows">
          {rows
            .filter((r) => r.paid > 0)
            .map((row) => (
              <div key={row.memberId} className="event-detail-row">
                <Avatar name={row.name} size="sm" />
                <span className="event-detail-row-name">{row.name}</span>
                <MonoAmount value={row.paid} currency={currency} />
              </div>
            ))}
        </div>
      ) : (
        <div className="event-detail-rows">
          {rows
            .filter((r) => r.posting > 0)
            .map((row) => (
              <div key={row.memberId} className="event-detail-row">
                <Avatar name={row.name} size="sm" />
                <span className="event-detail-row-name">{row.name}</span>
                <MonoAmount value={row.posting} currency={currency} />
              </div>
            ))}
        </div>
      )}

      <div className="event-detail-section-title event-detail-section-title--split">
        Who owes what
      </div>
      <div className="event-detail-rows">
        {rows.length === 0 && (
          <div className="event-detail-row event-detail-row-muted">
            <span>No participant detail available.</span>
          </div>
        )}
        {rows.map((row) => (
          <div key={row.memberId} className="event-detail-row">
            <Avatar name={row.name} size="sm" />
            <span className="event-detail-row-name">{row.name}</span>
            <span className="event-detail-row-side">
              {row.share > 0 && row.paid > 0 ? (
                <>
                  paid {formatAmount(row.paid, currency)} · share{' '}
                  {formatAmount(row.share, currency)}
                </>
              ) : row.share > 0 ? (
                <>
                  owes <strong>{formatAmount(row.share, currency)}</strong>
                </>
              ) : row.posting > 0 ? (
                <>
                  is owed <strong>{formatAmount(row.posting, currency)}</strong>
                </>
              ) : (
                'settled'
              )}
            </span>
          </div>
        ))}
      </div>

      {breakdown.derivedFromLedger && (
        <p className="event-detail-note">
          Details derived from the ledger for this older expense.
        </p>
      )}
    </div>
  );
}

function FlowDetail({
  event,
  memberName,
  currency,
  flow,
}: {
  event: BusinessEvent;
  memberName: (id: string) => string;
  currency: string;
  flow: 'lent to' | 'paid';
}) {
  const meta = event.metadata;
  const fromId =
    flow === 'lent to' ? meta?.lenderMemberId : meta?.cashPayerMemberId;
  const toId =
    flow === 'lent to' ? meta?.borrowerMemberId : meta?.cashReceiverMemberId;

  // Fall back to the ledger when metadata is absent (older events).
  const postings = event.postings ?? [];
  const fromFallback = fromId ?? postings.find((p) => p.amount > 0)?.memberId;
  const toFallback = toId ?? postings.find((p) => p.amount < 0)?.memberId;

  const fromName = fromId ? memberName(fromId) : fromFallback ? memberName(fromFallback) : null;
  const toName = toId ? memberName(toId) : toFallback ? memberName(toFallback) : null;

  return (
    <div className="event-detail-section">
      {fromName && toName && (
        <div className="event-detail-flow">
          <div className="event-detail-flow-person">
            <Avatar name={fromName} size="md" />
            <span>{fromName}</span>
          </div>
          <div className="event-detail-flow-middle">
            <span className="event-detail-flow-label">
              {flow === 'lent to' ? 'lent' : 'paid'}
            </span>
            <MonoAmount value={event.amount} currency={currency} />
          </div>
          <div className="event-detail-flow-person">
            <Avatar name={toName} size="md" />
            <span>{toName}</span>
          </div>
        </div>
      )}
      <p className="event-detail-flow-sentence">
        {fromName} {flow === 'lent to' ? 'lent' : 'paid'}{' '}
        <MonoAmount value={event.amount} currency={currency} />{' '}
        {flow === 'lent to' ? 'to' : 'to'} {toName}.
      </p>
      {!meta && fromFallback && toFallback && (
        <p className="event-detail-note">Details derived from the ledger.</p>
      )}
    </div>
  );
}

function RefundDetail({
  event,
  currency,
}: {
  event: BusinessEvent;
  currency: string;
}) {
  const meta = event.metadata;
  const originalAmount = meta?.refundedAmount ?? event.refundOf?.amount ?? event.amount;
  const originalId = meta?.refundedOfId ?? event.refundOfId;

  return (
    <div className="event-detail-section">
      <div className="event-detail-flow-sentence">
        A refund of <MonoAmount value={event.amount} currency={currency} /> from an{' '}
        <MonoAmount value={originalAmount} currency={currency} /> expense
        {event.createdBy ? `, recorded by ${event.createdBy.name}` : ''}.
      </div>
      {!originalId && (
        <p className="event-detail-note">The original expense is no longer available.</p>
      )}
      <p className="event-detail-note">
        Refunds rebuild balances as if the original amount had never left the payers’
        pockets.
      </p>
    </div>
  );
}

function AdjustmentDetail({
  event,
  memberName,
  currency,
}: {
  event: BusinessEvent;
  memberName: (id: string) => string;
  currency: string;
}) {
  const meta = event.metadata;
  const allocations = meta?.allocations ?? [];

  return (
    <div className="event-detail-section">
      <div className="event-detail-section-title">Applies a balance adjustment of</div>
      <div className="event-detail-rows">
        {allocations.map((a) => (
          <div key={a.memberId} className="event-detail-row">
            <Avatar name={memberName(a.memberId)} size="sm" />
            <span className="event-detail-row-name">{memberName(a.memberId)}</span>
            <MonoAmount value={a.amount} currency={currency} asBalance />
          </div>
        ))}
      </div>
    </div>
  );
}
