import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '@/api/events';
import type { CreateSharedExpenseDto, CreateCashMovementDto } from '@/api/types';

export const eventKeys = {
  list: (tripId: string) => ['trips', tripId, 'events'] as const,
  detail: (tripId: string, eventId: string) => ['trips', tripId, 'events', eventId] as const,
};

export function useEvents(tripId: string | null) {
  return useQuery({
    queryKey: eventKeys.list(tripId ?? ''),
    queryFn: () => eventsApi.getEvents(tripId!),
    enabled: Boolean(tripId),
  });
}

export function useEvent(tripId: string, eventId: string) {
  return useQuery({
    queryKey: eventKeys.detail(tripId, eventId),
    queryFn: () => eventsApi.getEventById(tripId, eventId),
    enabled: Boolean(tripId) && Boolean(eventId),
  });
}

/** Invalidates events + balances + suggestions after any mutation */
function useInvalidateAll(tripId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: eventKeys.list(tripId) });
    queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'balances'] });
    queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'suggestions'] });
  };
}

export function useCreateSharedExpense(tripId: string) {
  const invalidate = useInvalidateAll(tripId);
  return useMutation({
    mutationFn: (dto: CreateSharedExpenseDto) =>
      eventsApi.createSharedExpense(tripId, dto),
    onSuccess: invalidate,
  });
}

export function useCreateCashMovement(tripId: string) {
  const invalidate = useInvalidateAll(tripId);
  return useMutation({
    mutationFn: (dto: CreateCashMovementDto) =>
      eventsApi.createCashMovement(tripId, dto),
    onSuccess: invalidate,
  });
}
