import { create } from 'zustand';

interface UIState {
  // Active trip shown in the dashboard
  activeTripId: string | null;
  setActiveTripId: (id: string | null) => void;

  // Add expense modal
  addExpenseModalOpen: boolean;
  setAddExpenseModalOpen: (open: boolean) => void;

  // Add member modal
  addMemberModalOpen: boolean;
  setAddMemberModalOpen: (open: boolean) => void;

  // New trip modal
  newTripModalOpen: boolean;
  setNewTripModalOpen: (open: boolean) => void;

  // Toast notifications
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastIdCounter = 0;

export const useUIStore = create<UIState>((set, get) => ({
  activeTripId: null,
  setActiveTripId: (id) => set({ activeTripId: id }),

  addExpenseModalOpen: false,
  setAddExpenseModalOpen: (open) => set({ addExpenseModalOpen: open }),

  addMemberModalOpen: false,
  setAddMemberModalOpen: (open) => set({ addMemberModalOpen: open }),

  newTripModalOpen: false,
  setNewTripModalOpen: (open) => set({ newTripModalOpen: open }),

  toasts: [],
  addToast: (toast) => {
    const id = String(++toastIdCounter);
    set({ toasts: [...get().toasts, { ...toast, id }] });
    // Auto-remove after 4 seconds
    setTimeout(() => {
      get().removeToast(id);
    }, 4000);
  },
  removeToast: (id) =>
    set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
