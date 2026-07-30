import { apiClient } from './client';
import type { SettlementSuggestionsResponse } from './types';

export const settlementsApi = {
  getSuggestions: async (tripId: string): Promise<SettlementSuggestionsResponse> => {
    const { data } = await apiClient.get<SettlementSuggestionsResponse>(
      `/trips/${tripId}/settlements/suggestions`,
    );
    return data;
  },
};
