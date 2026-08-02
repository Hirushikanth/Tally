import { apiClient } from './client';
import type { MemberLedgerEntry, MemberLedgerResponse, TripBalancesResponse } from './types';

// Raw server shape: API entry id key is mapped to the UI-neutral entryId
type RawMemberLedgerResponse = Omit<MemberLedgerResponse, 'entries'> & {
  entries: Array<Omit<MemberLedgerEntry, 'entryId'> & { postingId: string }>;
};

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
    const { data } = await apiClient.get<RawMemberLedgerResponse>(
      `/trips/${tripId}/ledger/members/${memberId}`,
    );
    // Map the API entry id to the UI-neutral entryId
    return {
      ...data,
      entries: data.entries.map((entry) => ({
        ...entry,
        entryId: entry.postingId,
      })),
    };
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
