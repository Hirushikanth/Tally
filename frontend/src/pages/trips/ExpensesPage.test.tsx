import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ExpensesPage } from '@/pages/trips/ExpensesPage';
import { mockTrip } from '@/test/fixtures';
import { createTestQueryClient } from '@/test/testUtils';
import type { BusinessEvent } from '@/api/types';

vi.mock('@/hooks/useEvents', () => ({
  useInfiniteEvents: vi.fn(),
  useCreateSharedExpense: () => ({ mutateAsync: vi.fn() }),
  useCreateLoan: () => ({ mutateAsync: vi.fn() }),
  useCreateCashMovement: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/useTrips', () => ({
  useTrip: vi.fn(),
}));

import { useInfiniteEvents } from '@/hooks/useEvents';
import { useTrip } from '@/hooks/useTrips';

const mockedUseInfiniteEvents = vi.mocked(useInfiniteEvents);
const mockedUseTrip = vi.mocked(useTrip);

beforeEach(() => {
  mockedUseInfiniteEvents.mockReset();
  mockedUseTrip.mockReset();
});

function renderExpensesPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/trips/t1/expenses']}>
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeEvent(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: 'e1',
    tripId: 't1',
    type: 'SHARED_EXPENSE',
    notes: 'Dinner at the lodge',
    category: 'food',
    amount: 5000,
    createdById: 'u1',
    createdAt: '2026-07-02T00:00:00.000Z',
    refundOfId: null,
    ...overrides,
  };
}

describe('ExpensesPage', () => {
  it('shows the error state (with retry) when events fail to load', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockedUseTrip.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as never);
    mockedUseInfiniteEvents.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch,
    } as never);

    renderExpensesPage();

    expect(
      screen.getByText('We could not load expenses for this trip.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No expenses yet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders events from the query', () => {
    mockedUseTrip.mockReturnValue({
      data: mockTrip({ id: 't1' }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockedUseInfiniteEvents.mockReturnValue({
      data: {
        pages: [
          {
            items: [makeEvent()],
            page: 1,
            pageSize: 50,
            total: 1,
            totalPages: 1,
          },
        ],
      },
      isLoading: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as never);

    renderExpensesPage();

    expect(
      screen.getByRole('heading', { name: 'All Expenses' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Dinner at the lodge')).toBeInTheDocument();
    expect(screen.getByText('Shared expense')).toBeInTheDocument();
    expect(screen.queryByText('No expenses yet')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no events', () => {
    mockedUseTrip.mockReturnValue({
      data: mockTrip({ id: 't1' }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockedUseInfiniteEvents.mockReturnValue({
      data: { pages: [{ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }] },
      isLoading: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as never);

    renderExpensesPage();
    expect(screen.getByText('No expenses yet')).toBeInTheDocument();
  });

  it('opens the details modal when an expense row is clicked', async () => {
    const user = userEvent.setup();
    mockedUseTrip.mockReturnValue({
      data: mockTrip({ id: 't1' }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockedUseInfiniteEvents.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              makeEvent({
                metadata: {
                  payers: [{ memberId: 'm1', amountPaid: 5000 }],
                  split: { method: 'EQUAL', participantIds: ['m1', 'm2'] },
                },
                postings: [
                  { id: 'p1', businessEventId: 'e1', memberId: 'm1', amount: 2500, createdAt: '2026-07-02T00:00:00.000Z' },
                  { id: 'p2', businessEventId: 'e1', memberId: 'm2', amount: -2500, createdAt: '2026-07-02T00:00:00.000Z' },
                ],
              }),
            ],
            page: 1,
            pageSize: 50,
            total: 1,
            totalPages: 1,
          },
        ],
      },
      isLoading: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as never);

    renderExpensesPage();

    await user.click(
      screen.getByRole('button', { name: 'View details for Dinner at the lodge' }),
    );

    expect(
      screen.getByRole('heading', { name: 'Shared expense details' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Paid by')).toBeInTheDocument();
    expect(screen.getByText('Who owes what')).toBeInTheDocument();
  });
});
