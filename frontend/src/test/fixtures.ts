import type { AuthResponse, Trip, TripMember } from '@/api/types';

export const mockAuthResponse: AuthResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
};

export function mockMember(overrides: Partial<TripMember> = {}): TripMember {
  return {
    id: 'm1',
    tripId: 't1',
    userId: 'u1',
    role: 'OWNER',
    joinedAt: '2026-07-01T00:00:00.000Z',
    leftAt: null,
    user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
    ...overrides,
  };
}

export function mockTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    name: 'Kandy → Ella',
    description: 'Hills trip',
    currency: 'LKR',
    status: 'ACTIVE',
    createdAt: '2026-07-01T00:00:00.000Z',
    createdById: 'u1',
    members: [mockMember()],
    _count: { businessEvents: 0 },
    ...overrides,
  };
}
