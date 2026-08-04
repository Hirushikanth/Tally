import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { authApi } from '@/api/auth';
import { createTestQueryClient } from '@/test/testUtils';

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

const mockedForgotPassword = vi.mocked(authApi.forgotPassword);
const mockedVerifyAnswers = vi.mocked(authApi.verifyAnswers);
const mockedResetPassword = vi.mocked(authApi.resetPassword);

const QUESTIONS = [
  { id: 'q1', question: 'What was the name of your first pet?' },
  { id: 'q2', question: 'In which city were you born?' },
];

beforeEach(() => {
  mockedForgotPassword.mockReset();
  mockedVerifyAnswers.mockReset();
  mockedResetPassword.mockReset();
});

function renderForgotPasswordPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<div>Login marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ForgotPasswordPage', () => {
  it('walks through the full recovery flow', async () => {
    const user = userEvent.setup();
    mockedForgotPassword.mockResolvedValue({ found: true, questions: QUESTIONS });
    mockedVerifyAnswers.mockResolvedValue({ resetToken: 'reset-token-123' });
    mockedResetPassword.mockResolvedValue({ success: true });
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('What was the name of your first pet?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('In which city were you born?'),
    ).toBeInTheDocument();
    expect(mockedForgotPassword).toHaveBeenCalledWith({
      email: 'alice@example.com',
    });

    const answers = screen.getAllByPlaceholderText('Your answer');
    await user.type(answers[0]!, 'Fluffy');
    await user.type(answers[1]!, 'Kandy');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(mockedVerifyAnswers).toHaveBeenCalledWith({
      email: 'alice@example.com',
      answers: [
        { questionId: 'q1', answer: 'Fluffy' },
        { questionId: 'q2', answer: 'Kandy' },
      ],
    });

    const newPasswordInput = await screen.findByLabelText('New password');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(screen.getByLabelText('Confirm password'), 'newpassword123');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(mockedResetPassword).toHaveBeenCalledWith({
      token: 'reset-token-123',
      password: 'newpassword123',
    });
    expect(await screen.findByText('Password updated')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/login');
  });

  it('reports when no account is found', async () => {
    const user = userEvent.setup();
    mockedForgotPassword.mockResolvedValue({ found: false, questions: [] });
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText('Email'), 'ghost@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('No account was found with this email'),
    ).toBeInTheDocument();
    expect(mockedVerifyAnswers).not.toHaveBeenCalled();
  });

  it('shows an error when security answers are incorrect', async () => {
    const user = userEvent.setup();
    mockedForgotPassword.mockResolvedValue({ found: true, questions: QUESTIONS });
    mockedVerifyAnswers.mockRejectedValue(
      new Error('Invalid email or security answers'),
    );
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('What was the name of your first pet?');

    const answers = screen.getAllByPlaceholderText('Your answer');
    await user.type(answers[0]!, 'Wrong');
    await user.type(answers[1]!, 'AlsoWrong');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('Invalid email or security answers'),
    ).toBeInTheDocument();
  });
});