import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from './auth';

// Axios instance pointing at Vite dev proxy or direct backend
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const AUTH_EXEMPT_URLS = ['/auth/login', '/auth/register', '/auth/refresh'];

// ── Request interceptor: inject JWT from Zustand auth store ──
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor: single-flight refresh on 401 ──
// Concurrent 401s share one refresh call via a queued promise.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        return null;
      }
      try {
        // /auth/refresh is in AUTH_EXEMPT_URLS, so this can't loop
        const data = await authApi.refresh(refreshToken);
        useAuthStore.getState().setAuth(data);
        return data.accessToken;
      } catch {
        useAuthStore.getState().logout();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const { response, config } = error;
    const url = config?.url ?? '';
    const isAuthExempt = AUTH_EXEMPT_URLS.some((u) => url.includes(u));

    if (
      response?.status === 401 &&
      !isAuthExempt &&
      config &&
      !config.__isRetry
    ) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        config.__isRetry = true;
        config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(config);
      }
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    __isRetry?: boolean;
  }
}
