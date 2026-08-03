import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { resolveShares } from '@/lib/eventBreakdown';
import { mockMember } from '@/test/fixtures';
import type { BusinessEvent } from '@/api/types';

// Amounts are in minor units: 10000 minor = Rs 100.00
function makeSharedExpense(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: 'e1',
    tripId: 't1',
    type: 'SHARED_EXPENSE',
    notes: 'Dinner at the lodge',
    category: 'Food',
    amount: 10000,
    createdById: 'u1',
    createdAt: '2026-07-02T00:00:00.000Z',
    refundOfId: null,
    createdBy: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
    metadata: {
      payers: [{ memberId: 'm1', amountPaid: 10000 }],
      split: { method: 'EQUAL', participantIds: ['m1', 'm2', 'm3'] },
    },
    postings: [
      { id: 'p1', businessEventId: 'e1', memberId: 'm1', amount: 6667, createdAt: '2026-07-02T00:00:00.000Z' },
      { id: 'p2', businessEventId: 'e1', memberId: 'm2', amount: -3333, createdAt: '2026-07-02T00:00:00.000Z' },
      { id: 'p3', businessEventId: 'e1', memberId: 'm3', amount: -3334, createdAt: '2026-07-02T00:00:00.000Z' },
    ],
    ...overrides,
  };
}

const members = [
  mockMember({ id: 'm1', user: { id: 'u1', name: 'Alice', email: 'alice@example.com' } }),
  mockMember({ id: 'm2', userId: 'u2', user: { id: 'u2', name: 'Bob', email: 'bob@example.com' } }),
  mockMember({ id: 'm3', userId: 'u3', user: { id: 'u3', name: 'Carol', email: 'carol@example.com' } }),
];

function renderModal(event: BusinessEvent | null) {
  return render(
    <EventDetailsModal
      open
      event={event}
      currency="LKR"
      members={members}
      onClose={() => {}}
    />,
  );
}

describe('EventDetailsModal', () => {
  it('shows who paid and how a shared expense splits (from metadata)', () => {
    renderModal(makeSharedExpense());

    expect(screen.getByRole('heading', { name: 'Shared expense details' })).toBeInTheDocument();
    expect(screen.getByText('Dinner at the lodge')).toBeInTheDocument();
    expect(screen.getByText('Paid by')).toBeInTheDocument();
    // Alice appears in the header, the payer row and the split list
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Rs 100').length).toBeGreaterThanOrEqual(2); // total + paid row
    expect(screen.getByText(/Split equally/)).toBeInTheDocument();

    // Bob and Carol each owe a third; the remainder lands on the payer's share
    expect(screen.getByText('Who owes what')).toBeInTheDocument();
    expect(screen.getAllByText('Rs 33.33')).toHaveLength(2);
    expect(screen.getByText(/share Rs 33.34/)).toBeInTheDocument();
  });

  it('shows the exact amounts for a multi-payer expense', () => {
    renderModal(
      makeSharedExpense({
        metadata: {
          payers: [
            { memberId: 'm1', amountPaid: 6000 },
            { memberId: 'm2', amountPaid: 4000 },
          ],
          split: {
            method: 'EXACT',
            shares: [
              { memberId: 'm1', shareOwed: 5000 },
              { memberId: 'm2', shareOwed: 5000 },
            ],
          },
        },
        postings: [
          { id: 'p1', businessEventId: 'e1', memberId: 'm1', amount: 1000, createdAt: '2026-07-02T00:00:00.000Z' },
          { id: 'p2', businessEventId: 'e1', memberId: 'm2', amount: -1000, createdAt: '2026-07-02T00:00:00.000Z' },
        ],
      }),
    );

    // Both payers listed with the exact amounts they paid
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bob').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Rs 60')).toBeInTheDocument();
    expect(screen.getByText('Rs 40')).toBeInTheDocument();
    expect(screen.getByText(/Split by exact amounts/)).toBeInTheDocument();
  });

  it('falls back to the ledger for older expenses without metadata', () => {
    const event = makeSharedExpense();
    delete event.metadata;

    renderModal(event);

    expect(screen.getByText('Paid by')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(2);
    // Payer is derived from the ledger: paid the full amount, net of their share
    expect(screen.getByText(/Details derived from the ledger/)).toBeInTheDocument();
  });

  it('shows a loan as lender → borrower', () => {
    renderModal({
      id: 'e2',
      tripId: 't1',
      type: 'LOAN',
      notes: 'Cash for entrance fee',
      category: null,
      amount: 5000,
      createdById: 'u1',
      createdAt: '2026-07-02T00:00:00.000Z',
      refundOfId: null,
      createdBy: { id: 'u2', name: 'Bob', email: 'bob@example.com' },
      metadata: { lenderMemberId: 'm2', borrowerMemberId: 'm3' },
    });

    expect(screen.getByRole('heading', { name: 'Loan details' })).toBeInTheDocument();
    expect(screen.getAllByText('Bob').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getAllByText('Rs 50').length).toBeGreaterThanOrEqual(1);
  });

  it('shows a settlement as payer → receiver', () => {
    renderModal({
      id: 'e3',
      tripId: 't1',
      type: 'SETTLEMENT',
      notes: 'Bank transfer',
      category: null,
      amount: 3000,
      createdById: 'u1',
      createdAt: '2026-07-02T00:00:00.000Z',
      refundOfId: null,
      metadata: { cashPayerMemberId: 'm3', cashReceiverMemberId: 'm1' },
    });

    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Rs 30').length).toBeGreaterThanOrEqual(1);
  });

  it('shows refund details', () => {
    renderModal({
      id: 'e4',
      tripId: 't1',
      type: 'REFUND',
      notes: 'Hotel overcharge',
      category: null,
      amount: 4000,
      createdById: 'u1',
      createdAt: '2026-07-02T00:00:00.000Z',
      refundOfId: 'e1',
      metadata: { refundedOfId: 'e1', refundedAmount: 10000 },
    });

    const sentence = screen.getByText(
      (content: string, el: Element | null): boolean =>
        Boolean(el?.classList.contains('event-detail-flow-sentence') && content.includes('refund of')),
    );
    expect(sentence.textContent).toContain('Rs 40');
    expect(sentence.textContent).toContain('Rs 100');
  });

  it('closes when the close button is pressed', async () => {
    const user = userEvent.setup();
    renderModal(makeSharedExpense());
    await user.click(screen.getByRole('button', { name: 'Close' }));
  });
});

describe('resolveShares (mirrors the backend posting engine)', () => {
  it('splits equally with the remainder distributed deterministically', () => {
    const shares = resolveShares(10000, {
      method: 'EQUAL',
      participantIds: ['m1', 'm2', 'm3'],
    });
    expect(shares.get('m1')).toBe(3334);
    expect(shares.get('m2')).toBe(3333);
    expect(shares.get('m3')).toBe(3333);
  });

  it('splits by percentage rounding down large shares first', () => {
    const shares = resolveShares(1000, {
      method: 'PERCENTAGE',
      shares: [
        { memberId: 'm1', percent: 33.33 },
        { memberId: 'm2', percent: 33.33 },
        { memberId: 'm3', percent: 33.34 },
      ],
    });
    const total = [...shares.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
  });
});
