'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { usersService } from '@/services/users.service';
import PasswordInput from '@/components/ui/PasswordInput';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function AcceptInviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token  = params.get('token');
  const [done, setDone] = useState(false);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async (data) => {
    if (!token) return toast.error('Invalid invitation link');
    try {
      await usersService.acceptInvite({ token, password: data.password });
      setDone(true);
      setTimeout(() => router.replace('/login'), 3000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invitation link is invalid or expired');
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
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', margin: '0 0 10px' }}>Invalid Invitation</h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 8 }}>This invitation link is missing or invalid.</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Please contact your administrator.</p>
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
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', margin: '0 0 10px' }}>Account Activated!</h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Welcome aboard. Redirecting you to sign in…</p>
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Accept Invitation</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 6 }}>
          Set your password to activate your account
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PasswordInput
          id="password" label="Password"
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          error={errors.password?.message}
          {...register('password', {
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
            validate:  (v) => v === watch('password') || 'Passwords do not match',
          })}
        />

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Your invitation link expires in <strong>24 hours</strong>. After activating you can sign in normally.
          </p>
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
          Activate Account
        </Button>
      </form>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="login-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <LoadingSpinner />
        </div>
      }>
        <AcceptInviteInner />
      </Suspense>
    </div>
  );
}
