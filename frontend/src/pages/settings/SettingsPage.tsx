import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/common/Button';
import { PasswordInput } from '@/components/common/PasswordInput';
import { getApiErrorMessage } from '@/api/errors';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { passwordSchema } from '@/lib/password';
import {
  MIN_SECURITY_ANSWER_LENGTH,
  SECURITY_QUESTIONS,
} from '@/pages/auth/securityQuestions';
import './SettingsPage.css';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  });

const securityQuestionsSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    question1: z.string().min(1, 'Choose a security question'),
    answer1: z
      .string()
      .trim()
      .min(
        MIN_SECURITY_ANSWER_LENGTH,
        `Answer must be at least ${MIN_SECURITY_ANSWER_LENGTH} characters`,
      ),
    question2: z.string().min(1, 'Choose a security question'),
    answer2: z
      .string()
      .trim()
      .min(
        MIN_SECURITY_ANSWER_LENGTH,
        `Answer must be at least ${MIN_SECURITY_ANSWER_LENGTH} characters`,
      ),
  })
  .superRefine((data, ctx) => {
    if (data.question1 && data.question2 && data.question1 === data.question2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['question2'],
        message: 'Choose two different security questions',
      });
    }
  });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;
type SecurityQuestionsForm = z.infer<typeof securityQuestionsSchema>;

export function SettingsPage() {
  useDocumentTitle('Settings');
  const setAuth = useAuthStore((s) => s.setAuth);

  const { data: currentQuestions } = useQuery({
    queryKey: ['security-questions'],
    queryFn: authApi.getSecurityQuestions,
  });

  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [questionsSuccess, setQuestionsSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [questionsError, setQuestionsError] = useState('');

  const passwordForm = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
  });

  const questionsForm = useForm<SecurityQuestionsForm>({
    resolver: zodResolver(securityQuestionsSchema),
  });

  const onSubmitPassword = async (data: ChangePasswordForm) => {
    setPasswordError('');
    setPasswordSuccess('');
    try {
      const response = await authApi.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.password,
      });
      setAuth(response);
      setPasswordSuccess('Password changed.');
      passwordForm.reset();
    } catch (err) {
      setPasswordError(
        getApiErrorMessage(err, 'Could not change your password. Try again.'),
      );
    }
  };

  const onSubmitQuestions = async (data: SecurityQuestionsForm) => {
    setQuestionsError('');
    setQuestionsSuccess('');
    try {
      await authApi.updateSecurityQuestions({
        currentPassword: data.currentPassword,
        securityQuestions: [
          { question: data.question1, answer: data.answer1 },
          { question: data.question2, answer: data.answer2 },
        ],
      });
      setQuestionsSuccess('Security questions updated.');
      questionsForm.reset();
    } catch (err) {
      setQuestionsError(
        getApiErrorMessage(err, 'Could not update security questions.'),
      );
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-sub">
          Manage your account security and recovery options
        </p>
      </div>

      <div className="settings-grid">
        <section className="glass settings-card">
          <div className="settings-card-title">Change password</div>
          <p className="settings-card-sub">
            You'll be asked for your current password first. Other devices are
            signed out.
          </p>

          <form
            className="settings-form"
            onSubmit={passwordForm.handleSubmit(onSubmitPassword)}
            noValidate
          >
            <div className="form-group">
              <label className="form-label" htmlFor="set-current-password">
                Current password
              </label>
              <PasswordInput
                id="set-current-password"
                className={
                  passwordForm.formState.errors.currentPassword ? 'error' : ''
                }
                autoComplete="current-password"
                {...passwordForm.register('currentPassword')}
              />
              {passwordForm.formState.errors.currentPassword && (
                <span className="form-error">
                  {passwordForm.formState.errors.currentPassword.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="set-new-password">
                New password
              </label>
              <PasswordInput
                id="set-new-password"
                className={passwordForm.formState.errors.password ? 'error' : ''}
                autoComplete="new-password"
                {...passwordForm.register('password')}
              />
              {passwordForm.formState.errors.password && (
                <span className="form-error">
                  {passwordForm.formState.errors.password.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="set-confirm-password">
                Confirm new password
              </label>
              <PasswordInput
                id="set-confirm-password"
                className={
                  passwordForm.formState.errors.confirmPassword ? 'error' : ''
                }
                autoComplete="new-password"
                {...passwordForm.register('confirmPassword')}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <span className="form-error">
                  {passwordForm.formState.errors.confirmPassword.message}
                </span>
              )}
            </div>

            {passwordError && (
              <div className="auth-server-error">{passwordError}</div>
            )}
            {passwordSuccess && (
              <div className="auth-success" role="status">
                {passwordSuccess}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              loading={passwordForm.formState.isSubmitting}
            >
              Change password
            </Button>
          </form>
        </section>

        <section className="glass settings-card">
          <div className="settings-card-title">Security questions</div>
          <p className="settings-card-sub">
            Used to recover your account if you forget your password.
          </p>

          {currentQuestions && currentQuestions.length > 0 && (
            <div className="settings-current-questions">
              <div className="settings-current-label">
                Currently set up:
              </div>
              <ul>
                {currentQuestions.map((q) => (
                  <li key={q.id}>{q.question}</li>
                ))}
              </ul>
            </div>
          )}

          <form
            className="settings-form"
            onSubmit={questionsForm.handleSubmit(onSubmitQuestions)}
            noValidate
          >
            <div className="form-group">
              <label className="form-label" htmlFor="set-q-current-password">
                Current password
              </label>
              <PasswordInput
                id="set-q-current-password"
                className={
                  questionsForm.formState.errors.currentPassword ? 'error' : ''
                }
                autoComplete="current-password"
                {...questionsForm.register('currentPassword')}
              />
              {questionsForm.formState.errors.currentPassword && (
                <span className="form-error">
                  {questionsForm.formState.errors.currentPassword.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="set-question-1">
                Security question 1
              </label>
              <select
                id="set-question-1"
                className={`form-select ${questionsForm.formState.errors.question1 ? 'error' : ''}`}
                defaultValue=""
                {...questionsForm.register('question1')}
              >
                <option value="" disabled>
                  Choose a question
                </option>
                {SECURITY_QUESTIONS.map((question) => (
                  <option key={question} value={question}>
                    {question}
                  </option>
                ))}
              </select>
              {questionsForm.formState.errors.question1 && (
                <span className="form-error">
                  {questionsForm.formState.errors.question1.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="set-answer-1">
                Answer 1
              </label>
              <input
                id="set-answer-1"
                type="text"
                className={`form-input ${questionsForm.formState.errors.answer1 ? 'error' : ''}`}
                placeholder="Your answer"
                autoComplete="off"
                {...questionsForm.register('answer1')}
              />
              {questionsForm.formState.errors.answer1 && (
                <span className="form-error">
                  {questionsForm.formState.errors.answer1.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="set-question-2">
                Security question 2
              </label>
              <select
                id="set-question-2"
                className={`form-select ${questionsForm.formState.errors.question2 ? 'error' : ''}`}
                defaultValue=""
                {...questionsForm.register('question2')}
              >
                <option value="" disabled>
                  Choose a question
                </option>
                {SECURITY_QUESTIONS.map((question) => (
                  <option key={question} value={question}>
                    {question}
                  </option>
                ))}
              </select>
              {questionsForm.formState.errors.question2 && (
                <span className="form-error">
                  {questionsForm.formState.errors.question2.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="set-answer-2">
                Answer 2
              </label>
              <input
                id="set-answer-2"
                type="text"
                className={`form-input ${questionsForm.formState.errors.answer2 ? 'error' : ''}`}
                placeholder="Your answer"
                autoComplete="off"
                {...questionsForm.register('answer2')}
              />
              {questionsForm.formState.errors.answer2 && (
                <span className="form-error">
                  {questionsForm.formState.errors.answer2.message}
                </span>
              )}
            </div>

            {questionsError && (
              <div className="auth-server-error">{questionsError}</div>
            )}
            {questionsSuccess && (
              <div className="auth-success" role="status">
                {questionsSuccess}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              loading={questionsForm.formState.isSubmitting}
            >
              Save questions
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
