import { useQuery } from '@tanstack/react-query';
import { settlementsApi } from '@/api/settlements';

export const settlementKeys = {
  suggestions: (tripId: string) => ['trips', tripId, 'suggestions'] as const,
};

export function useSuggestions(tripId: string | null) {
  return useQuery({
    queryKey: settlementKeys.suggestions(tripId ?? ''),
    queryFn: () => settlementsApi.getSuggestions(tripId!),
    enabled: Boolean(tripId),
  });
}
