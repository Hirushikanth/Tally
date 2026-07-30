import { apiClient } from './client';
import type {
  BusinessEvent,
  CreateSharedExpenseDto,
  CreateLoanDto,
  CreateCashMovementDto,
  CreateRefundDto,
  CreateAdjustmentDto,
} from './types';

export const eventsApi = {
  createSharedExpense: async (
    tripId: string,
    dto: CreateSharedExpenseDto,
  ): Promise<BusinessEvent> => {
    const { data } = await apiClient.post<BusinessEvent>(
      `/trips/${tripId}/events/shared-expense`,
      dto,
    );
    return data;
  },

  createLoan: async (tripId: string, dto: CreateLoanDto): Promise<BusinessEvent> => {
    const { data } = await apiClient.post<BusinessEvent>(`/trips/${tripId}/events/loan`, dto);
    return data;
  },

  createCashMovement: async (
    tripId: string,
    dto: CreateCashMovementDto,
  ): Promise<BusinessEvent> => {
    const { data } = await apiClient.post<BusinessEvent>(
      `/trips/${tripId}/events/cash-movement`,
      dto,
    );
    return data;
  },

  createRefund: async (tripId: string, dto: CreateRefundDto): Promise<BusinessEvent> => {
    const { data } = await apiClient.post<BusinessEvent>(`/trips/${tripId}/events/refund`, dto);
    return data;
  },

  createAdjustment: async (tripId: string, dto: CreateAdjustmentDto): Promise<BusinessEvent> => {
    const { data } = await apiClient.post<BusinessEvent>(
      `/trips/${tripId}/events/adjustment`,
      dto,
    );
    return data;
  },

  getEvents: async (tripId: string): Promise<BusinessEvent[]> => {
    const { data } = await apiClient.get<BusinessEvent[]>(`/trips/${tripId}/events`);
    return data;
  },

  getEventById: async (tripId: string, eventId: string): Promise<BusinessEvent> => {
    const { data } = await apiClient.get<BusinessEvent>(`/trips/${tripId}/events/${eventId}`);
    return data;
  },
};
