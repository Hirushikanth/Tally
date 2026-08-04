import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/api/auth';
import type { SecurityQuestion } from '@/api/types';
import { Button } from '@/components/common/Button';
import { PasswordInput } from '@/components/common/PasswordInput';
import { Stars } from '@/components/Stars';
import { getApiErrorMessage } from '@/api/errors';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { confirmPasswordSchema } from '@/lib/password';
import './AuthPages.css';

type Step = 'email' | 'answers' | 'new-password' | 'done';

const emailSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
});

const answersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      answer: z
        .string()
        .trim()
        .min(1, 'An answer is required'),
    }),
  ),
});

type EmailForm = z.infer<typeof emailSchema>;
type PasswordForm = z.infer<typeof confirmPasswordSchema>;

export function ForgotPasswordPage() {
  useDocumentTitle('Forgot password');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [resetToken, setResetToken] = useState('');
  const [serverError, setServerError] = useState('');

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });

  const answersForm = useForm<{ answers: { questionId: string; answer: string }[] }>({
    resolver: zodResolver(answersSchema),
    defaultValues: { answers: questions.map((q) => ({ questionId: q.id, answer: '' })) },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(confirmPasswordSchema),
  });

  const onSubmitEmail = async (data: EmailForm) => {
    setServerError('');
    try {
      const response = await authApi.forgotPassword({ email: data.email });
      if (!response.found) {
        setServerError('No account was found with this email');
        return;
      }
      if (response.questions.length === 0) {
        setServerError(
          'This account has no security questions set up. Contact support to recover access.',
        );
        return;
      }
      setEmail(data.email);
      setQuestions(response.questions);
      answersForm.reset({
        answers: response.questions.map((q) => ({
          questionId: q.id,
          answer: '',
        })),
      });
      setStep('answers');
    } catch (err) {
      setServerError(
        getApiErrorMessage(err, 'Could not look up this account. Try again.'),
      );
    }
  };

  const onSubmitAnswers = async (data: {
    answers: { questionId: string; answer: string }[];
  }) => {
    setServerError('');
    try {
      const response = await authApi.verifyAnswers({
        email,
        answers: data.answers,
      });
      setResetToken(response.resetToken);
      setStep('new-password');
    } catch (err) {
      setServerError(
        getApiErrorMessage(err, 'One or more answers are incorrect'),
      );
    }
  };

  const onSubmitPassword = async (data: PasswordForm) => {
    setServerError('');
    try {
      await authApi.resetPassword({
        token: resetToken,
        password: data.password,
      });
      setStep('done');
    } catch (err) {
      setServerError(
        getApiErrorMessage(err, 'Could not reset your password. Try again.'),
      );
    }
  };

  const resetToEmail = () => {
    setServerError('');
    setStep('email');
  };

  return (
    <>
      <Stars />
      <div className="auth-page">
        <div className="auth-card glass">
          <div className="auth-brand">
            <div className="auth-brand-mark">T</div>
            <div className="auth-brand-name">
              Tally<span>.</span>
            </div>
          </div>

          {step === 'email' && (
            <>
              <div className="auth-header">
                <h1 className="auth-title">Forgot your password?</h1>
                <p className="auth-subtitle">
                  Enter your email to recover your account
                </p>
              </div>

              <form
                className="auth-form"
                onSubmit={emailForm.handleSubmit(onSubmitEmail)}
                noValidate
              >
                <div className="form-group">
                  <label className="form-label" htmlFor="fp-email">
                    Email
                  </label>
                  <input
                    id="fp-email"
                    type="email"
                    className={`form-input ${emailForm.formState.errors.email ? 'error' : ''}`}
                    placeholder="you@example.com"
                    autoComplete="email"
                    {...emailForm.register('email')}
                  />
                  {emailForm.formState.errors.email && (
                    <span className="form-error">
                      {emailForm.formState.errors.email.message}
                    </span>
                  )}
                </div>

                {serverError && (
                  <div className="auth-server-error">{serverError}</div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={emailForm.formState.isSubmitting}
                  size="lg"
                >
                  Continue
                </Button>
              </form>
            </>
          )}

          {step === 'answers' && (
            <>
              <div className="auth-header">
                <h1 className="auth-title">Answer your security questions</h1>
                <p className="auth-subtitle">
                  For <strong>{email}</strong>
                </p>
              </div>

              <form
                className="auth-form"
                onSubmit={answersForm.handleSubmit(onSubmitAnswers)}
                noValidate
              >
                {questions.map((question, index) => (
                  <div className="form-group" key={question.id}>
                    <label className="form-label" htmlFor={`fp-answer-${index}`}>
                      {question.question}
                    </label>
                    <input
                      id={`fp-answer-${index}`}
                      type="text"
                      className="form-input"
                      placeholder="Your answer"
                      autoComplete="off"
                      {...answersForm.register(`answers.${index}.answer`)}
                    />
                    {answersForm.formState.errors.answers?.[index]?.answer && (
                      <span className="form-error">
                        {answersForm.formState.errors.answers[index]?.answer
                          ?.message}
                      </span>
                    )}
                  </div>
                ))}

                {serverError && (
                  <div className="auth-server-error">{serverError}</div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={answersForm.formState.isSubmitting}
                  size="lg"
                >
                  Continue
                </Button>

                <button
                  type="button"
                  className="auth-text-button"
                  onClick={resetToEmail}
                >
                  Use a different email
                </button>
              </form>
            </>
          )}

          {step === 'new-password' && (
            <>
              <div className="auth-header">
                <h1 className="auth-title">Set a new password</h1>
                <p className="auth-subtitle">
                  Choose a strong password you haven't used before
                </p>
              </div>

              <form
                className="auth-form"
                onSubmit={passwordForm.handleSubmit(onSubmitPassword)}
                noValidate
              >
                <div className="form-group">
                  <label className="form-label" htmlFor="fp-new-password">
                    New password
                  </label>
                  <PasswordInput
                    id="fp-new-password"
                    className={passwordForm.formState.errors.password ? 'error' : ''}
                    placeholder="Min. 8 characters"
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
                  <label className="form-label" htmlFor="fp-confirm-password">
                    Confirm password
                  </label>
                  <PasswordInput
                    id="fp-confirm-password"
                    className={
                      passwordForm.formState.errors.confirmPassword ? 'error' : ''
                    }
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    {...passwordForm.register('confirmPassword')}
                  />
                  {passwordForm.formState.errors.confirmPassword && (
                    <span className="form-error">
                      {passwordForm.formState.errors.confirmPassword.message}
                    </span>
                  )}
                </div>

                {serverError && (
                  <div className="auth-server-error">{serverError}</div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={passwordForm.formState.isSubmitting}
                  size="lg"
                >
                  Reset password
                </Button>
              </form>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="auth-header">
                <h1 className="auth-title">Password updated</h1>
                <p className="auth-subtitle">
                  Your password has been reset. You're all signed out of other
                  devices.
                </p>
              </div>
              <Link to="/login" className="btn btn-primary btn-full btn-lg">
                Sign in
              </Link>
            </>
          )}

          {step !== 'done' && (
            <p className="auth-switch">
              Remembered it?{' '}
              <Link to="/login" className="auth-link">
                Back to sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}