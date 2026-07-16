'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/dashboard');
  }, [isLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="login-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (isAuthenticated) return null;

  const onSubmit = async (data) => {
    try {
      await login(data.email, data.password);
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid email or password.');
    }
  };

  return (
    <div className="login-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="login-card animate-fadeIn" style={{ width: '100%', maxWidth: 420, padding: '40px 36px' }}>

        {/* Brand mark */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
         
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', letterSpacing: '-0.4px', margin: 0 }}>
            Flow Marine
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 6 }}>
            Sign in to your operations platform
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            id="email" label="Email address" type="email"
            placeholder="you@company.com"
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern:  { value: /\S+@\S+\.\S+/, message: 'Enter a valid email' },
            })}
          />

          <div>
            <PasswordInput
              id="password" label="Password"
              placeholder="Enter your password"
              error={errors.password?.message}
              {...register('password', { required: 'Password is required' })}
            />
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <a
                href="/forgot-password"
                style={{ fontSize: 12.5, color: 'var(--teal)', textDecoration: 'none', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                Forgot password?
              </a>
            </div>
          </div>

          <Button
            type="submit" size="lg" loading={isSubmitting}
            style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
          >
            Sign in
          </Button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 24 }}>
        Flow Marine Operations Platform
        </p>
      </div>
    </div>
  );
}
