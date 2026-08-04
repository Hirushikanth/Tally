import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
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
import './AuthPages.css';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  useDocumentTitle('Sign in');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const justRegistered = (location.state as { registered?: boolean } | null)
    ?.registered;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  if (isAuthenticated) {
    return <Navigate to="/trips" replace />;
  }

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    try {
      const response = await authApi.login(data);
      login(response);
      navigate('/trips');
    } catch (err) {
      setServerError(getApiErrorMessage(err, 'Invalid email or password'));
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
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-subtitle">Sign in to your account to continue</p>
          </div>

          {justRegistered && (
            <div className="auth-success" role="status">
              Account created — sign in to continue.
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
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
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <PasswordInput
                id="login-password"
                className={errors.password ? 'error' : ''}
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && (
                <span className="form-error">{errors.password.message}</span>
              )}
            </div>

            <div className="auth-form-links">
              <Link to="/forgot-password" className="auth-link">
                Forgot password?
              </Link>
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
              Sign in
            </Button>
          </form>

          <p className="auth-switch">
            New to Tally?{' '}
            <Link to="/register" className="auth-link">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
