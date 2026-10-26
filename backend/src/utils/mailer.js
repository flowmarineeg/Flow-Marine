'use strict';

const nodemailer = require('nodemailer');
const logger     = require('./logger');

// ─── HTML escape — Sprint020 SEC-007 ─────────────────────────────────────────
// Prevents XSS if an attacker registers with a name containing HTML tags.
const escapeHtml = (str) => String(str || '')
  .replace(/&/g,  '&amp;')
  .replace(/</g,  '&lt;')
  .replace(/>/g,  '&gt;')
  .replace(/"/g,  '&quot;')
  .replace(/'/g,  '&#039;');

// ─── Transporter ─────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_APP_PASSWORD,
  },
});

const smtpConfigured = !!(process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD);
if (smtpConfigured) {
  transporter.verify((err) => {
    if (err) logger.warn(`[Mailer] SMTP connection failed: ${err.message}`);
    else     logger.info('[Mailer] SMTP ready');
  });
} else {
  logger.warn('[Mailer] SMTP_EMAIL / SMTP_APP_PASSWORD not set - emails will not be sent');
}

// ─── Base sender ─────────────────────────────────────────────────────────────
const sendMail = async ({ to, subject, html }) => {
  if (!smtpConfigured) throw new Error('Email is not configured (SMTP_EMAIL / SMTP_APP_PASSWORD)');
  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'Logistics SaaS'}" <${process.env.SMTP_EMAIL}>`,
      to, subject, html,
    });
    logger.info(`[Mailer] Email sent to ${to} — "${subject}"`);
  } catch (err) {
    logger.error(`[Mailer] Failed to send email to ${to}: ${err.message}`);
    throw err;
  }
};

// ─── Templates ───────────────────────────────────────────────────────────────
const sendInvitationEmail = async (to, name, inviteUrl) => {
  const safeName = escapeHtml(name);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1e293b;">You've been invited to Logistics SaaS</h2>
      <p>Hi <strong>${safeName}</strong>,</p>
      <p>You've been invited to join the Logistics &amp; Shipping Operations platform.</p>
      <p>Click the button below to set your password and activate your account:</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${inviteUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
          Accept Invitation
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px;">
        This invitation link expires in <strong>24 hours</strong>.<br/>
        If you did not expect this email, you can safely ignore it.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;">Logistics SaaS — Operations Platform</p>
    </div>
  `;
  await sendMail({ to, subject: "You've been invited to Logistics SaaS", html });
};

const sendPasswordResetEmail = async (to, name, resetUrl) => {
  const safeName = escapeHtml(name);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1e293b;">Reset Your Password</h2>
      <p>Hi <strong>${safeName}</strong>,</p>
      <p>We received a request to reset the password for your Logistics SaaS account.</p>
      <p>Click the button below to set a new password:</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
          Reset Password
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px;">
        This link expires in <strong>1 hour</strong>.<br/>
        If you did not request a password reset, you can safely ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;">Logistics SaaS — Operations Platform</p>
    </div>
  `;
  await sendMail({ to, subject: 'Reset Your Password — Logistics SaaS', html });
};

const sendPasswordChangedEmail = async (to, name) => {
  const safeName = escapeHtml(name);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1e293b;">Password Changed Successfully</h2>
      <p>Hi <strong>${safeName}</strong>,</p>
      <p>Your password has been changed successfully.</p>
      <p>If you did not make this change, please contact your administrator immediately.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;">Logistics SaaS — Operations Platform</p>
    </div>
  `;
  await sendMail({ to, subject: 'Your Password Was Changed — Logistics SaaS', html });
};

module.exports = { sendInvitationEmail, sendPasswordResetEmail, sendPasswordChangedEmail };
