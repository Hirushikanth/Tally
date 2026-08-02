import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { RegisterPage } from '@/pages/auth/RegisterPage';
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
  },
}));

const mockedRegister = vi.mocked(authApi.register);

beforeEach(() => {
  mockedRegister.mockReset();
  useAuthStore.setState({ user: null, token: null, refreshToken: null, isAuthenticated: false });
});

function renderRegisterPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/trips" element={<div>Trips marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegisterPage', () => {
  it('renders the form fields and submit button', () => {
    renderRegisterPage();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('shows validation errors for invalid input', async () => {
    const user = userEvent.setup();
    renderRegisterPage();
    await user.type(screen.getByLabelText('Full name'), 'A');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Name must be at least 2 characters'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(
      screen.getByText('Password must be at least 8 characters'),
    ).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('submits the dto and navigates to /trips on success', async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue(mockAuthResponse);
    renderRegisterPage();

    await user.type(screen.getByLabelText('Full name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Trips marker')).toBeInTheDocument();
    expect(mockedRegister).toHaveBeenCalledWith({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('shows the server error message on failure', async () => {
    const user = userEvent.setup();
    mockedRegister.mockRejectedValue(
      new Error('An account with this email already exists.'),
    );
    renderRegisterPage();

    await user.type(screen.getByLabelText('Full name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
  });
});
