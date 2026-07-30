import { apiClient } from './client';
import type { MemberLedgerResponse, TripBalancesResponse } from './types';

export const ledgerApi = {
  getBalances: async (tripId: string): Promise<TripBalancesResponse> => {
    const { data } = await apiClient.get<TripBalancesResponse>(
      `/trips/${tripId}/ledger/balances`,
    );
    return data;
  },

  getMemberLedger: async (
    tripId: string,
    memberId: string,
  ): Promise<MemberLedgerResponse> => {
    const { data } = await apiClient.get<MemberLedgerResponse>(
      `/trips/${tripId}/ledger/members/${memberId}`,
    );
    return data;
  },

  getTripLedger: async (tripId: string) => {
    const { data } = await apiClient.get(`/trips/${tripId}/ledger`);
    return data;
  },

  rebuildSnapshots: async (tripId: string) => {
    const { data } = await apiClient.post(`/trips/${tripId}/ledger/rebuild-snapshots`);
    return data;
  },
};
