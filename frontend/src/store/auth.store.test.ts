import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import { mockAuthResponse } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
  });
  localStorage.clear();
});

describe('auth.store', () => {
  it('login stores user, tokens and auth flag', () => {
    useAuthStore.getState().login(mockAuthResponse);
    const s = useAuthStore.getState();
    expect(s.user).toEqual(mockAuthResponse.user);
    expect(s.token).toBe('access-token');
    expect(s.refreshToken).toBe('refresh-token');
    expect(s.isAuthenticated).toBe(true);
  });

  it('setAuth stores the same shape as login', () => {
    useAuthStore.getState().setAuth(mockAuthResponse);
    const s = useAuthStore.getState();
    expect(s.token).toBe('access-token');
    expect(s.refreshToken).toBe('refresh-token');
    expect(s.isAuthenticated).toBe(true);
  });

  it('logout clears auth state', () => {
    useAuthStore.getState().login(mockAuthResponse);
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });

  it('updateUser replaces the user', () => {
    useAuthStore.getState().login(mockAuthResponse);
    useAuthStore.getState().updateUser({
      id: 'u1',
      name: 'Alice B.',
      email: 'alice@example.com',
    });
    expect(useAuthStore.getState().user?.name).toBe('Alice B.');
  });

  it('persists auth state to localStorage', () => {
    useAuthStore.getState().login(mockAuthResponse);
    const raw = localStorage.getItem('tally-auth');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { state: { isAuthenticated: boolean; token: string } };
    expect(parsed.state.isAuthenticated).toBe(true);
    expect(parsed.state.token).toBe('access-token');
  });

  it('rehydrates auth state from localStorage on a fresh page load', async () => {
    useAuthStore.getState().login(mockAuthResponse);
    const raw = localStorage.getItem('tally-auth');
    expect(raw).toBeTruthy();

    // Simulate a page reload: fresh module → fresh store → rehydrates from storage.
    vi.resetModules();
    const { useAuthStore: freshStore } = await import('@/store/auth.store');
    await freshStore.persist.rehydrate();

    const s = freshStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.token).toBe('access-token');
    expect(s.refreshToken).toBe('refresh-token');
    expect(s.user?.email).toBe('alice@example.com');
  });
});
