import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Test hook: lets integration tests capture outgoing links. */
export const mailOutbox: { to: string; subject: string; link: string }[] = [];

function layout(title: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#F7F8FA;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
  <table width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0">
  <tr><td style="font-size:20px;font-weight:700;color:#2563EB;padding-bottom:24px">ExpenseFlow</td></tr>
  <tr><td style="font-size:18px;font-weight:600;padding-bottom:12px">${title}</td></tr>
  <tr><td style="font-size:14px;line-height:22px;color:#6B7280;padding-bottom:24px">${body}</td></tr>
  <tr><td><a href="${cta.url}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;font-size:14px">${cta.label}</a></td></tr>
  <tr><td style="font-size:12px;color:#9CA3AF;padding-top:24px">If you didn't request this, you can safely ignore this email.</td></tr>
  </table></td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string, link: string): Promise<void> {
  if (env.isTest) {
    mailOutbox.push({ to, subject, link });
    return;
  }
  const t = getTransporter();
  if (!t) {
    if (env.isProd) {
      logger.warn({ subject }, 'SMTP not configured — email not sent');
    } else {
      // Development convenience only: SMTP isn't configured, so print the link prominently
      // (to stdout, independent of LOG_LEVEL) so the flow can be completed locally.
      const bar = '─'.repeat(72);
      // eslint-disable-next-line no-console
      console.log(`\n${bar}\n📧  EMAIL NOT SENT (no SMTP configured) — open this link instead:\n    ${subject} → ${to}\n    ${link}\n${bar}\n`);
    }
    return;
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, to, subject, html });
  } catch (err) {
    logger.error({ err, subject }, 'Failed to send email');
  }
}

export const mailService = {
  sendVerification(to: string, name: string, token: string) {
    const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    return send(
      to,
      'Verify your email',
      layout(`Welcome, ${escapeHtml(name)}!`, 'Confirm your email address to secure your ExpenseFlow account.', {
        label: 'Verify email',
        url,
      }),
      url,
    );
  },
  sendPasswordReset(to: string, token: string) {
    const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    return send(
      to,
      'Reset your password',
      layout('Reset your password', 'This link expires in 1 hour and can be used once.', { label: 'Reset password', url }),
      url,
    );
  },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
