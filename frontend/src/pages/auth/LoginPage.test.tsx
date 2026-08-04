import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from '@/pages/auth/LoginPage';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { createTestQueryClient } from '@/test/testUtils';
import { mockAuthResponse } from '@/test/fixtures';

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    verifyAnswers: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const mockedLogin = vi.mocked(authApi.login);

beforeEach(() => {
  mockedLogin.mockReset();
  useAuthStore.setState({ user: null, token: null, refreshToken: null, isAuthenticated: false });
});

function renderLoginPage(initialEntries: (string | { pathname: string; state?: unknown })[] = ['/login']) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/trips" element={<div>Trips marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  it('renders the form fields and submit button', () => {
    renderLoginPage();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Forgot password?' }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('shows validation errors for empty submit', async () => {
    const user = userEvent.setup();
    renderLoginPage();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it('submits credentials and navigates to /trips on success', async () => {
    const user = userEvent.setup();
    mockedLogin.mockResolvedValue(mockAuthResponse);
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Trips marker')).toBeInTheDocument();
    expect(mockedLogin).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'password123',
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('shows the server error message on failure', async () => {
    const user = userEvent.setup();
    mockedLogin.mockRejectedValue(
      new Error('Invalid email or password'),
    );
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Invalid email or password'),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows a success banner when arriving from account creation', () => {
    renderLoginPage([{ pathname: '/login', state: { registered: true } }]);
    expect(
      screen.getByText('Account created — sign in to continue.'),
    ).toBeInTheDocument();
  });

  it('redirects to /trips when already authenticated', () => {
    useAuthStore.setState({
      user: mockAuthResponse.user,
      token: 't',
      refreshToken: 'r',
      isAuthenticated: true,
    });
    renderLoginPage();
    expect(screen.getByText('Trips marker')).toBeInTheDocument();
  });
});
