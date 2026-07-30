import { apiClient } from './client';
import type { AddMemberDto, TripMember } from './types';

export const membersApi = {
  addMember: async (tripId: string, dto: AddMemberDto): Promise<TripMember> => {
    const { data } = await apiClient.post<TripMember>(`/trips/${tripId}/members`, dto);
    return data;
  },

  getMembers: async (tripId: string): Promise<TripMember[]> => {
    const { data } = await apiClient.get<TripMember[]>(`/trips/${tripId}/members`);
    return data;
  },

  leaveTrip: async (tripId: string): Promise<void> => {
    await apiClient.post(`/trips/${tripId}/members/leave`);
  },
};
