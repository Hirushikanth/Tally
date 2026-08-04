import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/common/Button';
import { PasswordInput } from '@/components/common/PasswordInput';
import { Stars } from '@/components/Stars';
import { getApiErrorMessage } from '@/api/errors';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  MIN_SECURITY_ANSWER_LENGTH,
  SECURITY_QUESTIONS,
} from './securityQuestions';
import { passwordSchema } from '@/lib/password';
import './AuthPages.css';

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be at most 100 characters'),
    email: z.string().trim().email('Enter a valid email'),
    password: passwordSchema,
    confirmPassword: z.string(),
    question1: z.string().min(1, 'Choose a security question'),
    answer1: z
      .string()
      .trim()
      .min(MIN_SECURITY_ANSWER_LENGTH, `Answer must be at least ${MIN_SECURITY_ANSWER_LENGTH} characters`),
    question2: z.string().min(1, 'Choose a security question'),
    answer2: z
      .string()
      .trim()
      .min(MIN_SECURITY_ANSWER_LENGTH, `Answer must be at least ${MIN_SECURITY_ANSWER_LENGTH} characters`),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
    if (data.question1 && data.question2 && data.question1 === data.question2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['question2'],
        message: 'Choose two different security questions',
      });
    }
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  useDocumentTitle('Create account');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  if (isAuthenticated) {
    return <Navigate to="/trips" replace />;
  }

  const onSubmit = async (data: RegisterForm) => {
    setServerError('');
    try {
      // Registration only creates the account — the user signs in afterwards.
      await authApi.register({
        name: data.name,
        email: data.email,
        password: data.password,
        securityQuestions: [
          { question: data.question1, answer: data.answer1 },
          { question: data.question2, answer: data.answer2 },
        ],
      });
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      setServerError(
        getApiErrorMessage(err, 'Registration failed. Please try again.'),
      );
    }
  };

  return (
    <>
      <Stars />
      <div className="auth-page">
        <div className="auth-card glass">
          {/* Brand */}
          <div className="auth-brand">
            <div className="auth-brand-mark">T</div>
            <div className="auth-brand-name">
              Tally<span>.</span>
            </div>
          </div>

          <div className="auth-header">
            <h1 className="auth-title">Create your account</h1>
            <p className="auth-subtitle">
              Start tracking group expenses in seconds
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">
                Full name
              </label>
              <input
                id="reg-name"
                type="text"
                className={`form-input ${errors.name ? 'error' : ''}`}
                placeholder="Hirushikanth"
                autoComplete="name"
                {...register('name')}
              />
              {errors.name && (
                <span className="form-error">{errors.name.message}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                className={`form-input ${errors.email ? 'error' : ''}`}
                placeholder="you@example.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <span className="form-error">{errors.email.message}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">
                Password
              </label>
              <PasswordInput
                id="reg-password"
                className={errors.password ? 'error' : ''}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                {...register('password')}
              />
              {errors.password && (
                <span className="form-error">{errors.password.message}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-confirm-password">
                Confirm password
              </label>
              <PasswordInput
                id="reg-confirm-password"
                className={errors.confirmPassword ? 'error' : ''}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <span className="form-error">
                  {errors.confirmPassword.message}
                </span>
              )}
            </div>

            <div className="auth-section-title">
              Security questions — used to recover your account
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-question-1">
                Security question 1
              </label>
              <select
                id="reg-question-1"
                className={`form-select ${errors.question1 ? 'error' : ''}`}
                defaultValue=""
                {...register('question1')}
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
              {errors.question1 && (
                <span className="form-error">{errors.question1.message}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-answer-1">
                Answer 1
              </label>
              <input
                id="reg-answer-1"
                type="text"
                className={`form-input ${errors.answer1 ? 'error' : ''}`}
                placeholder="Your answer"
                autoComplete="off"
                {...register('answer1')}
              />
              {errors.answer1 && (
                <span className="form-error">{errors.answer1.message}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-question-2">
                Security question 2
              </label>
              <select
                id="reg-question-2"
                className={`form-select ${errors.question2 ? 'error' : ''}`}
                defaultValue=""
                {...register('question2')}
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
              {errors.question2 && (
                <span className="form-error">{errors.question2.message}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-answer-2">
                Answer 2
              </label>
              <input
                id="reg-answer-2"
                type="text"
                className={`form-input ${errors.answer2 ? 'error' : ''}`}
                placeholder="Your answer"
                autoComplete="off"
                {...register('answer2')}
              />
              {errors.answer2 && (
                <span className="form-error">{errors.answer2.message}</span>
              )}
            </div>

            {serverError && (
              <div className="auth-server-error">{serverError}</div>
            )}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isSubmitting}
              size="lg"
            >
              Create account
            </Button>
          </form>

          <p className="auth-switch">
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
