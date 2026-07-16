'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { authService } from '@/services/auth.service';
import PasswordInput from '@/components/ui/PasswordInput';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token  = params.get('token');
  const [done, setDone] = useState(false);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async (data) => {
    if (!token) return toast.error('Invalid reset link');
    try {
      await authService.resetPassword(token, data.newPassword);
      setDone(true);
      setTimeout(() => router.replace('/login'), 3000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset link is invalid or expired');
    }
  };

  if (!token) {
    return (
      <div className="login-card animate-fadeIn" style={{ width: '100%', maxWidth: 420, padding: '40px 36px', textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="24" height="24" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', margin: '0 0 10px' }}>Invalid Reset Link</h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 20 }}>This reset link is missing or invalid.</p>
        <a href="/forgot-password" style={{ fontSize: 13.5, color: 'var(--teal)', fontWeight: 500, textDecoration: 'none' }}>
          Request a new link →
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-card animate-fadeIn" style={{ width: '100%', maxWidth: 420, padding: '40px 36px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="26" height="26" fill="none" stroke="#059669" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', margin: '0 0 10px' }}>Password Reset!</h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <div className="login-card animate-fadeIn" style={{ width: '100%', maxWidth: 420, padding: '40px 36px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', boxShadow: '0 4px 16px rgba(13,148,136,0.35)',
        }}>
          <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Set New Password</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 6 }}>Choose a strong password for your account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PasswordInput
          id="newPassword" label="New Password"
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          error={errors.newPassword?.message}
          {...register('newPassword', {
            required:  'Password is required',
            minLength: { value: 8,                         message: 'Minimum 8 characters' },
            pattern:   { value: /(?=.*[A-Z])(?=.*[0-9])/, message: 'Must include uppercase letter and number' },
          })}
        />
        <PasswordInput
          id="confirmPassword" label="Confirm Password"
          placeholder="Re-enter your password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword', {
            required: 'Please confirm your password',
            validate:  (v) => v === watch('newPassword') || 'Passwords do not match',
          })}
        />
        <Button type="submit" size="lg" loading={isSubmitting} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
          Reset Password
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="login-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <LoadingSpinner />
        </div>
      }>
        <ResetPasswordInner />
      </Suspense>
    </div>
  );
}
