import { useQuery } from '@tanstack/react-query';
import { ledgerApi } from '@/api/ledger';

export const ledgerKeys = {
  balances: (tripId: string) => ['trips', tripId, 'balances'] as const,
  memberLedger: (tripId: string, memberId: string) =>
    ['trips', tripId, 'ledger', memberId] as const,
};

export function useBalances(tripId: string | null) {
  return useQuery({
    queryKey: ledgerKeys.balances(tripId ?? ''),
    queryFn: () => ledgerApi.getBalances(tripId!),
    enabled: Boolean(tripId),
    // Refresh every 30 seconds to stay live
    refetchInterval: 30_000,
  });
}

export function useMemberLedger(tripId: string, memberId: string) {
  return useQuery({
    queryKey: ledgerKeys.memberLedger(tripId, memberId),
    queryFn: () => ledgerApi.getMemberLedger(tripId, memberId),
    enabled: Boolean(tripId) && Boolean(memberId),
  });
}
