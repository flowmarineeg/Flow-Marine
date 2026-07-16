'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { authService } from '@/services/auth.service';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async (data) => {
    try {
      await authService.forgotPassword(data.email);
      setSent(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  };

  if (sent) {
    return (
      <div className="login-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div className="login-card animate-fadeIn" style={{ width: '100%', maxWidth: 420, padding: '40px 36px', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: '#D1FAE5', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <svg width="26" height="26" fill="none" stroke="#059669" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', margin: '0 0 10px' }}>Check your email</h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>
            If that email exists in our system, a password reset link has been sent. The link expires in <strong>1 hour</strong>.
          </p>
          <a href="/login" style={{
            fontSize: 13.5, color: 'var(--teal)', fontWeight: 500, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            ← Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="login-card animate-fadeIn" style={{ width: '100%', maxWidth: 420, padding: '40px 36px' }}>

        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 4px 16px rgba(13,148,136,0.35)',
          }}>
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Forgot Password</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 6 }}>
            Enter your email and we'll send a reset link
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input id="email" label="Email address" type="email" placeholder="you@company.com" required
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email' },
            })} />

          <Button type="submit" size="lg" loading={isSubmitting} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            Send Reset Link
          </Button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/login" style={{ fontSize: 13, color: 'var(--teal)', textDecoration: 'none', fontWeight: 500 }}>
            ← Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
