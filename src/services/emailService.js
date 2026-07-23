const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter;

function isEmailConfigured() {
  return Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPass && env.emailFrom);
}

function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: { user: env.smtpUser, pass: env.smtpPass },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      disableFileAccess: true,
      disableUrlAccess: true
    });
  }
  return transporter;
}

function absoluteUrl(pathname) {
  return new URL(pathname, env.appUrl).toString();
}

function safeName(name = 'there') {
  return String(name || 'there').replace(/[\r\n<>]/g, '').trim().slice(0, 120) || 'there';
}

async function sendEmail({ to, subject, text, html }) {
  const client = getTransporter();
  if (!client) {
    if (env.nodeEnv === 'production') throw new Error('Email delivery is not configured.');
    return { delivered: false, development: true };
  }

  const info = await client.sendMail({
    from: env.emailFrom,
    to: String(to || '').trim().toLowerCase(),
    subject: String(subject || '').replace(/[\r\n]/g, ' ').slice(0, 180),
    text,
    html
  });
  return { delivered: true, messageId: info.messageId };
}

async function sendVerificationEmail({ user, token }) {
  const url = absoluteUrl(`/auth/verify-email?token=${encodeURIComponent(token)}`);
  const name = safeName(user.name);
  return sendEmail({
    to: user.pendingEmail || user.email,
    subject: 'Verify your AutoBrand AI email',
    text: `Hello ${name},\n\nVerify your email by opening this link:\n${url}\n\nThis link expires in 24 hours. If you did not request this, ignore this email.`,
    html: `<p>Hello ${name},</p><p>Verify your email by opening the secure link below:</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours. If you did not request this, ignore this email.</p>`
  });
}

async function sendPasswordResetEmail({ user, token }) {
  const url = absoluteUrl(`/auth/reset-password?token=${encodeURIComponent(token)}`);
  const name = safeName(user.name);
  return sendEmail({
    to: user.email,
    subject: 'Reset your AutoBrand AI password',
    text: `Hello ${name},\n\nReset your password by opening this link:\n${url}\n\nThis link expires in 15 minutes. If you did not request this, ignore this email.`,
    html: `<p>Hello ${name},</p><p>Reset your password by opening the secure link below:</p><p><a href="${url}">Reset password</a></p><p>This link expires in 15 minutes. If you did not request this, ignore this email.</p>`
  });
}


async function sendTeamInviteEmail({ member, brandName, inviterName, token }) {
  const url = absoluteUrl(`/dashboard/actions/team/accept?token=${encodeURIComponent(token)}`);
  return sendEmail({
    to: member.email,
    subject: `Invitation to ${brandName} on AutoBrand AI`,
    text: `${safeName(inviterName)} invited you to collaborate on ${safeName(brandName)}.\n\nAccept the invitation:\n${url}\n\nThis link expires in 7 days and only works for ${member.email}.`,
    html: `<p>${safeName(inviterName)} invited you to collaborate on <strong>${safeName(brandName)}</strong>.</p><p><a href="${url}">Accept invitation</a></p><p>This link expires in 7 days and only works for ${member.email}.</p>`
  });
}

module.exports = {
  absoluteUrl,
  isEmailConfigured,
  sendEmail,
  sendPasswordResetEmail,
  sendTeamInviteEmail,
  sendVerificationEmail
};
