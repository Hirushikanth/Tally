import { apiClient } from './client';
import type { CreateTripDto, Trip } from './types';

export const tripsApi = {
  createTrip: async (dto: CreateTripDto): Promise<Trip> => {
    const { data } = await apiClient.post<Trip>('/trips', dto);
    return data;
  },

  getTrips: async (): Promise<Trip[]> => {
    const { data } = await apiClient.get<Trip[]>('/trips');
    return data;
  },

  getTripById: async (tripId: string): Promise<Trip> => {
    const { data } = await apiClient.get<Trip>(`/trips/${tripId}`);
    return data;
  },

  archiveTrip: async (tripId: string): Promise<Trip> => {
    const { data } = await apiClient.post<Trip>(`/trips/${tripId}/archive`);
    return data;
  },
};
