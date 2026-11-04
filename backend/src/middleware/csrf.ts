import type { RequestHandler } from 'express';
import { AppError } from '../utils/errors';
import { CSRF_COOKIE } from '../utils/cookies';
import { safeEqual } from '../utils/crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection for cookie-authenticated, state-changing requests.
 * The client echoes the `ef_csrf` cookie value in the `X-CSRF-Token` header; a cross-site
 * attacker can make the browser send the cookie but cannot read it to forge the header.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token'));
  }
  next();
};
