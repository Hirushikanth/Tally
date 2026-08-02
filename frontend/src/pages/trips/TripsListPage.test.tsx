import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TripsListPage } from '@/pages/trips/TripsListPage';
import { mockTrip } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

vi.mock('@/hooks/useTrips', () => ({
  useTrips: vi.fn(),
  useCreateTrip: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

import { useTrips } from '@/hooks/useTrips';

const mockedUseTrips = vi.mocked(useTrips);

beforeEach(() => {
  mockedUseTrips.mockReset();
});

describe('TripsListPage', () => {
  it('renders trips from the query', () => {
    mockedUseTrips.mockReturnValue({
      data: [
        mockTrip({ id: 't1', name: 'Kandy → Ella', status: 'ACTIVE' }),
        mockTrip({
          id: 't2',
          name: 'Old Trip',
          status: 'ARCHIVED',
          description: null,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderWithProviders(<TripsListPage />);

    expect(screen.getByRole('heading', { name: 'Your Trips' })).toBeInTheDocument();
    expect(screen.getByText('Kandy → Ella')).toBeInTheDocument();
    expect(screen.getByText('Old Trip')).toBeInTheDocument();
    expect(screen.getByText('Active trips')).toBeInTheDocument();
    // "Archived" appears as the section label and the archived card's badge.
    expect(screen.getAllByText('Archived').length).toBeGreaterThan(0);
    expect(screen.queryByText('No trips yet')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no trips', () => {
    mockedUseTrips.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderWithProviders(<TripsListPage />);
    expect(screen.getByText('No trips yet')).toBeInTheDocument();
  });

  it('shows the error state with a working retry instead of the empty state', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockedUseTrips.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);
    renderWithProviders(<TripsListPage />);

    expect(
      screen.getByText(
        'We could not load your trips. Check your connection and try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No trips yet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
