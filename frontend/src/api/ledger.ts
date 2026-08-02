import { apiClient } from './client';
import type {
  MemberLedgerEntry,
  MemberLedgerResponse,
  Paginated,
  PaginationParams,
  TripBalancesResponse,
} from './types';

// Raw server shape: API entry id key is mapped to the UI-neutral entryId
type RawMemberLedgerEntry = Omit<MemberLedgerEntry, 'entryId'> & {
  postingId: string;
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
    params: PaginationParams = {},
  ): Promise<MemberLedgerResponse> => {
    const { data } = await apiClient.get<
      Omit<MemberLedgerResponse, 'items'> & {
        items: RawMemberLedgerEntry[];
      }
    >(`/trips/${tripId}/ledger/members/${memberId}`, { params });
    // Map the API entry id to the UI-neutral entryId
    return {
      ...data,
      items: data.items.map((entry) => ({
        ...entry,
        entryId: entry.postingId,
      })),
    };
  },

  getTripLedger: async (
    tripId: string,
    params: PaginationParams = {},
  ): Promise<Paginated<unknown>> => {
    const { data } = await apiClient.get(`/trips/${tripId}/ledger`, { params });
    return data;
  },

  rebuildSnapshots: async (tripId: string) => {
    const { data } = await apiClient.post(`/trips/${tripId}/ledger/rebuild-snapshots`);
    return data;
  },
};
