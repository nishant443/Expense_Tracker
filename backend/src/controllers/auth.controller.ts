import type { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type AuthResponse,
} from '@expenseflow/shared';
import { authService, type IssuedSession } from '../services/auth.service';
import { toUserDTO } from '../services/mappers';
import { CSRF_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies, setCsrfCookie } from '../utils/cookies';
import { randomToken } from '../utils/crypto';
import { asyncHandler, parseBody, userId } from '../utils/http';

function applySession(res: Response, s: IssuedSession) {
  setAuthCookies(res, s);
}

function ensureCsrf(req: Request, res: Response): string {
  const existing = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (existing && existing.length >= 32) return existing;
  const token = randomToken();
  setCsrfCookie(res, token);
  return token;
}

export const authController = {
  csrf: asyncHandler(async (req, res) => {
    res.json({ csrfToken: ensureCsrf(req, res) });
  }),

  register: asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req);
    const { user, session } = await authService.register(input, req.get('user-agent'));
    applySession(res, session);
    res.status(201).json({ user: toUserDTO(user), csrfToken: ensureCsrf(req, res) } satisfies AuthResponse);
  }),

  login: asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req);
    const { user, session } = await authService.login(input, req.get('user-agent'));
    applySession(res, session);
    res.json({ user: toUserDTO(user), csrfToken: ensureCsrf(req, res) } satisfies AuthResponse);
  }),

  refresh: asyncHandler(async (req, res) => {
    try {
      const session = await authService.refresh(req.cookies?.[REFRESH_COOKIE], req.get('user-agent'));
      applySession(res, session);
      res.json({ ok: true });
    } catch (err) {
      // Keep cookies on a benign race (another tab already rotated them); otherwise clear.
      if (!(err instanceof Error && 'code' in err && err.code === 'REFRESH_RACE')) clearAuthCookies(res);
      throw err;
    }
  }),

  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    res.status(204).end();
  }),

  logoutAll: asyncHandler(async (req, res) => {
    await authService.logoutAll(userId(req));
    clearAuthCookies(res);
    res.status(204).end();
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const { email } = parseBody(forgotPasswordSchema, req);
    await authService.forgotPassword(email);
    res.status(202).json({ message: 'If an account exists for that email, a reset link has been sent.' });
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const { token, password } = parseBody(resetPasswordSchema, req);
    await authService.resetPassword(token, password);
    clearAuthCookies(res);
    res.json({ message: 'Password updated. Please sign in.' });
  }),

  verifyEmail: asyncHandler(async (req, res) => {
    const { token } = parseBody(verifyEmailSchema, req);
    await authService.verifyEmail(token);
    res.json({ message: 'Email verified' });
  }),

  resendVerification: asyncHandler(async (req, res) => {
    await authService.resendVerification(userId(req));
    res.status(202).json({ message: 'Verification email sent' });
  }),
};
