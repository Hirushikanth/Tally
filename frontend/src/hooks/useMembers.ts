import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { membersApi } from '@/api/members';
import type { AddMemberDto } from '@/api/types';

export const memberKeys = {
  list: (tripId: string) => ['trips', tripId, 'members'] as const,
};

export function useMembers(tripId: string | null) {
  return useQuery({
    queryKey: memberKeys.list(tripId ?? ''),
    queryFn: () => membersApi.getMembers(tripId!),
    enabled: Boolean(tripId),
  });
}

export function useAddMember(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AddMemberDto) => membersApi.addMember(tripId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: ['trips', tripId] });
    },
  });
}

export function useLeaveTrip(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => membersApi.leaveTrip(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}
