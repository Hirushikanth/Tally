import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import axe from 'axe-core';
import { LoginPage } from '@/pages/auth/LoginPage';
import { TripsListPage } from '@/pages/trips/TripsListPage';
import { mockTrip } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

vi.mock('@/hooks/useTrips', () => ({
  useTrips: vi.fn(),
  useCreateTrip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { useTrips } from '@/hooks/useTrips';

const mockedUseTrips = vi.mocked(useTrips);

afterEach(() => {
  mockedUseTrips.mockReset();
});

/** Run axe against the current document, failing on critical/serious only. */
async function expectNoSeriousViolations() {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  });
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  const summary = serious.map(
    (v) => `${v.id}: ${v.impact} (${v.nodes.length} nodes)`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

describe('axe accessibility scans', () => {
  it('reports no critical/serious violations on the login page', async () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    await expectNoSeriousViolations();
  });

  it('reports no critical/serious violations on the trips list page', async () => {
    mockedUseTrips.mockReturnValue({
      data: [
        mockTrip({ id: 't1', name: 'Kandy → Ella', status: 'ACTIVE' }),
        mockTrip({ id: 't2', name: 'Old Trip', status: 'ARCHIVED' }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderWithProviders(<TripsListPage />);
    expect(screen.getByRole('heading', { name: 'Your Trips' })).toBeInTheDocument();
    await expectNoSeriousViolations();
  });
});
