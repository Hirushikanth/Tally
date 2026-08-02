import { create } from 'zustand';

interface UIState {
  // Active trip shown in the dashboard
  activeTripId: string | null;
  setActiveTripId: (id: string | null) => void;

  // Mobile off-canvas sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Add expense modal
  addExpenseModalOpen: boolean;
  setAddExpenseModalOpen: (open: boolean) => void;

  // Add loan modal
  addLoanModalOpen: boolean;
  setAddLoanModalOpen: (open: boolean) => void;

  // Add cash movement modal (repayment / settlement)
  addCashMovementModalOpen: boolean;
  setAddCashMovementModalOpen: (open: boolean) => void;

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

  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  addExpenseModalOpen: false,
  setAddExpenseModalOpen: (open) => set({ addExpenseModalOpen: open }),

  addLoanModalOpen: false,
  setAddLoanModalOpen: (open) => set({ addLoanModalOpen: open }),

  addCashMovementModalOpen: false,
  setAddCashMovementModalOpen: (open) => set({ addCashMovementModalOpen: open }),

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
