import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '@/api/events';
import type {
  CreateSharedExpenseDto,
  CreateLoanDto,
  CreateCashMovementDto,
} from '@/api/types';

export const DEFAULT_PAGE_SIZE = 50;

export const eventKeys = {
  list: (tripId: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) =>
    ['trips', tripId, 'events', page, pageSize] as const,
  infinite: (tripId: string) => ['trips', tripId, 'events', 'infinite'] as const,
  detail: (tripId: string, eventId: string) => ['trips', tripId, 'events', eventId] as const,
};

/** First page of events — used by the dashboard summary. */
export function useEvents(tripId: string | null) {
  return useQuery({
    queryKey: eventKeys.list(tripId ?? ''),
    queryFn: () => eventsApi.getEvents(tripId!, { page: 1, pageSize: DEFAULT_PAGE_SIZE }),
    enabled: Boolean(tripId),
  });
}

/** Load-more pagination — used by ExpensesPage. */
export function useInfiniteEvents(tripId: string | null) {
  return useInfiniteQuery({
    queryKey: eventKeys.infinite(tripId ?? ''),
    queryFn: ({ pageParam }) =>
      eventsApi.getEvents(tripId!, { page: pageParam, pageSize: DEFAULT_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
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
    queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'events'] });
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

export function useCreateLoan(tripId: string) {
  const invalidate = useInvalidateAll(tripId);
  return useMutation({
    mutationFn: (dto: CreateLoanDto) => eventsApi.createLoan(tripId, dto),
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
