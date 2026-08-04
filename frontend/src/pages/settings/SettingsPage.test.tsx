import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { SettingsPage } from '@/pages/settings/SettingsPage';
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
    getSecurityQuestions: vi.fn(),
    updateSecurityQuestions: vi.fn(),
    changePassword: vi.fn(),
  },
}));

const mockedGetSecurityQuestions = vi.mocked(authApi.getSecurityQuestions);
const mockedUpdateSecurityQuestions = vi.mocked(
  authApi.updateSecurityQuestions,
);
const mockedChangePassword = vi.mocked(authApi.changePassword);

const CURRENT_QUESTIONS = [
  { id: 'q1', question: 'What was the name of your first pet?' },
  { id: 'q2', question: 'In which city were you born?' },
];

beforeEach(() => {
  mockedGetSecurityQuestions.mockReset();
  mockedUpdateSecurityQuestions.mockReset();
  mockedChangePassword.mockReset();
  mockedGetSecurityQuestions.mockResolvedValue(CURRENT_QUESTIONS);
  useAuthStore.setState({
    user: mockAuthResponse.user,
    token: 'old-token',
    refreshToken: 'old-refresh',
    isAuthenticated: true,
  });
});

function renderSettingsPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  it('renders both sections and the current security questions', async () => {
    renderSettingsPage();

    expect(
      await screen.findByRole('button', { name: 'Change password' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save questions' }),
    ).toBeInTheDocument();
    const currentQuestions = await screen.findByText('Currently set up:');
    const currentList = currentQuestions.closest(
      '.settings-current-questions',
    ) as HTMLElement;
    expect(
      within(currentList).getByText('What was the name of your first pet?'),
    ).toBeInTheDocument();
    expect(
      within(currentList).getByText('In which city were you born?'),
    ).toBeInTheDocument();
    expect(mockedGetSecurityQuestions).toHaveBeenCalled();
  });

  it('validates the change-password form', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    await screen.findByLabelText('New password');

    const fields = screen.getAllByLabelText(
      /(Current password|New password|Confirm new password)/,
    );
    await user.type(fields[0]!, 'password123');
    await user.type(screen.getByLabelText('New password'), 'newpassword456');
    await user.type(fields[2]!, 'different456');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByText('Passwords do not match'),
    ).toBeInTheDocument();
    expect(mockedChangePassword).not.toHaveBeenCalled();
  });

  it('changes the password and updates the stored session', async () => {
    const user = userEvent.setup();
    mockedChangePassword.mockResolvedValue({
      ...mockAuthResponse,
      refreshToken: 'new-refresh',
      accessToken: 'new-access',
    });
    renderSettingsPage();
    await screen.findByLabelText('New password');

    const currentFields = screen.getAllByLabelText('Current password');
    await user.type(currentFields[0]!, 'password123');
    await user.type(screen.getByLabelText('New password'), 'newpassword456');
    await user.type(
      screen.getByLabelText('Confirm new password'),
      'newpassword456',
    );
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByText('Password changed.'),
    ).toBeInTheDocument();
    expect(mockedChangePassword).toHaveBeenCalledWith({
      currentPassword: 'password123',
      newPassword: 'newpassword456',
    });
    expect(useAuthStore.getState().token).toBe('new-access');
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('shows the error when the current password is wrong', async () => {
    const user = userEvent.setup();
    mockedChangePassword.mockRejectedValue(
      new Error('Current password is incorrect'),
    );
    renderSettingsPage();
    await screen.findByLabelText('New password');

    const currentFields = screen.getAllByLabelText('Current password');
    await user.type(currentFields[0]!, 'wrongpass');
    await user.type(screen.getByLabelText('New password'), 'newpassword456');
    await user.type(
      screen.getByLabelText('Confirm new password'),
      'newpassword456',
    );
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByText('Current password is incorrect'),
    ).toBeInTheDocument();
  });

  it('validates the security questions form', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    await screen.findByText('Security questions');

    const currentFields = screen.getAllByLabelText('Current password');
    await user.type(currentFields[1]!, 'password123');
    await user.selectOptions(
      screen.getByLabelText('Security question 1'),
      SECURITY_QUESTIONS[0],
    );
    await user.selectOptions(
      screen.getByLabelText('Security question 2'),
      SECURITY_QUESTIONS[0],
    );
    await user.type(screen.getByLabelText('Answer 1'), 'Fluffy');
    await user.type(screen.getByLabelText('Answer 2'), 'Kandy');
    await user.click(screen.getByRole('button', { name: 'Save questions' }));

    expect(
      await screen.findByText('Choose two different security questions'),
    ).toBeInTheDocument();
    expect(mockedUpdateSecurityQuestions).not.toHaveBeenCalled();
  });

  it('updates the security questions', async () => {
    const user = userEvent.setup();
    mockedUpdateSecurityQuestions.mockResolvedValue({ success: true });
    renderSettingsPage();
    await screen.findByText('Security questions');

    const currentFields = screen.getAllByLabelText('Current password');
    await user.type(currentFields[1]!, 'password123');
    await user.selectOptions(
      screen.getByLabelText('Security question 1'),
      SECURITY_QUESTIONS[0],
    );
    await user.selectOptions(
      screen.getByLabelText('Security question 2'),
      SECURITY_QUESTIONS[3],
    );
    await user.type(screen.getByLabelText('Answer 1'), 'Fluffy');
    await user.type(screen.getByLabelText('Answer 2'), 'Kandy');
    await user.click(screen.getByRole('button', { name: 'Save questions' }));

    expect(
      await screen.findByText('Security questions updated.'),
    ).toBeInTheDocument();
    expect(mockedUpdateSecurityQuestions).toHaveBeenCalledWith({
      currentPassword: 'password123',
      securityQuestions: [
        { question: SECURITY_QUESTIONS[0], answer: 'Fluffy' },
        { question: SECURITY_QUESTIONS[3], answer: 'Kandy' },
      ],
    });
  });

  it('shows an error when updating security questions fails', async () => {
    const user = userEvent.setup();
    mockedUpdateSecurityQuestions.mockRejectedValue(
      new Error('Current password is incorrect'),
    );
    renderSettingsPage();
    await screen.findByText('Security questions');

    const currentFields = screen.getAllByLabelText('Current password');
    await user.type(currentFields[1]!, 'nope');
    await user.selectOptions(
      screen.getByLabelText('Security question 1'),
      SECURITY_QUESTIONS[0],
    );
    await user.selectOptions(
      screen.getByLabelText('Security question 2'),
      SECURITY_QUESTIONS[3],
    );
    await user.type(screen.getByLabelText('Answer 1'), 'Fluffy');
    await user.type(screen.getByLabelText('Answer 2'), 'Kandy');
    await user.click(screen.getByRole('button', { name: 'Save questions' }));

    expect(
      await screen.findByText('Current password is incorrect'),
    ).toBeInTheDocument();
  });
});
