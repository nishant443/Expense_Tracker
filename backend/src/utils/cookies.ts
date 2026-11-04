import type { CookieOptions, Response } from 'express';
import { env } from '../config/env';

export const ACCESS_COOKIE = 'ef_at';
export const REFRESH_COOKIE = 'ef_rt';
export const CSRF_COOKIE = 'ef_csrf';

function base(): CookieOptions {
  return {
    secure: env.isProd || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
  };
}

export function setAuthCookies(
  res: Response,
  opts: { accessToken: string; refreshToken: string; remember: boolean; refreshExpires: Date },
): void {
  res.cookie(ACCESS_COOKIE, opts.accessToken, {
    ...base(),
    httpOnly: true,
    path: '/api',
    maxAge: env.ACCESS_TOKEN_TTL_MIN * 60_000,
  });
  res.cookie(REFRESH_COOKIE, opts.refreshToken, {
    ...base(),
    httpOnly: true,
    path: '/api/auth',
    // "Remember me" → persistent cookie; otherwise a browser-session cookie (server TTL still applies).
    ...(opts.remember ? { expires: opts.refreshExpires } : {}),
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(), httpOnly: true, path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { ...base(), httpOnly: true, path: '/api/auth' });
}

export function setCsrfCookie(res: Response, token: string): void {
  // Readable by same-site JS; the token is also returned in the response body for cross-site setups.
  res.cookie(CSRF_COOKIE, token, { ...base(), httpOnly: false, path: '/' });
}
