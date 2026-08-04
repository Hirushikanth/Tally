import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { createTestQueryClient } from '@/test/testUtils';
import { mockAuthResponse } from '@/test/fixtures';
import { SECURITY_QUESTIONS } from '@/pages/auth/securityQuestions';

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

const mockedRegister = vi.mocked(authApi.register);

const QUESTION_1 = SECURITY_QUESTIONS[0];
const QUESTION_2 = SECURITY_QUESTIONS[3];

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
          <Route path="/login" element={<div>Login marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Alice');
  await user.type(screen.getByLabelText('Email'), 'alice@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.type(screen.getByLabelText('Confirm password'), 'password123');
  await user.selectOptions(screen.getByLabelText('Security question 1'), QUESTION_1);
  await user.type(screen.getByLabelText('Answer 1'), 'Fluffy');
  await user.selectOptions(screen.getByLabelText('Security question 2'), QUESTION_2);
  await user.type(screen.getByLabelText('Answer 2'), 'Kandy');
}

describe('RegisterPage', () => {
  it('renders the form fields and submit button', () => {
    renderRegisterPage();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByLabelText('Security question 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Answer 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Security question 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Answer 2')).toBeInTheDocument();
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
      screen.getByText(
        'Password must be at least 8 characters and contain at least one letter and one number',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Choose a security question').length).toBe(2);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('requires a password containing a letter and a number', async () => {
    const user = userEvent.setup();
    renderRegisterPage();
    await user.type(screen.getByLabelText('Full name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'passwordonly');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText(
        'Password must be at least 8 characters and contain at least one letter and one number',
      ),
    ).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirm password', async () => {
    const user = userEvent.setup();
    renderRegisterPage();
    await user.type(screen.getByLabelText('Full name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password124');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Passwords do not match'),
    ).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('rejects two identical security questions', async () => {
    const user = userEvent.setup();
    renderRegisterPage();
    await user.type(screen.getByLabelText('Full name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.selectOptions(screen.getByLabelText('Security question 1'), QUESTION_1);
    await user.type(screen.getByLabelText('Answer 1'), 'Fluffy');
    await user.selectOptions(screen.getByLabelText('Security question 2'), QUESTION_1);
    await user.type(screen.getByLabelText('Answer 2'), 'Kandy');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Choose two different security questions'),
    ).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('creates the account and sends the user to login — does not log in', async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue({ user: mockAuthResponse.user });
    renderRegisterPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Login marker')).toBeInTheDocument();
    expect(mockedRegister).toHaveBeenCalledWith({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
      securityQuestions: [
        { question: QUESTION_1, answer: 'Fluffy' },
        { question: QUESTION_2, answer: 'Kandy' },
      ],
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows the server error message on failure', async () => {
    const user = userEvent.setup();
    mockedRegister.mockRejectedValue(
      new Error('An account with this email already exists.'),
    );
    renderRegisterPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
