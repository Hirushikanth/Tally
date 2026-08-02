import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/common/Button';
import { Stars } from '@/components/Stars';
import { getApiErrorMessage } from '@/api/errors';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import './AuthPages.css';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  useDocumentTitle('Create account');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
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
      const response = await authApi.register(data);
      login(response);
      navigate('/trips');
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
            <p className="auth-subtitle">Start tracking group expenses in seconds</p>
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
              <input
                id="reg-password"
                type="password"
                className={`form-input ${errors.password ? 'error' : ''}`}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                {...register('password')}
              />
              {errors.password && (
                <span className="form-error">{errors.password.message}</span>
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
