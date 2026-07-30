import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tripsApi } from '@/api/trips';
import type { CreateTripDto } from '@/api/types';

export const tripKeys = {
  all: ['trips'] as const,
  detail: (id: string) => ['trips', id] as const,
};

export function useTrips() {
  return useQuery({
    queryKey: tripKeys.all,
    queryFn: tripsApi.getTrips,
  });
}

export function useTrip(tripId: string | null) {
  return useQuery({
    queryKey: tripKeys.detail(tripId ?? ''),
    queryFn: () => tripsApi.getTripById(tripId!),
    enabled: Boolean(tripId),
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTripDto) => tripsApi.createTrip(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.all });
    },
  });
}

export function useArchiveTrip(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tripsApi.archiveTrip(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.all });
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
    },
  });
}
