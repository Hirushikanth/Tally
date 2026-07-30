import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

// Axios instance pointing at Vite dev proxy or direct backend
export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request interceptor: inject JWT from Zustand auth store ──
apiClient.interceptors.request.use(
  (config) => {
    // Read token directly from localStorage to avoid circular dependency with Zustand
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor: handle 401 → logout & redirect ──
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
