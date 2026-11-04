import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from '../utils/errors';
import { ACCESS_COOKIE } from '../utils/cookies';

interface AccessClaims {
  sub: string;
  sid: string;
}

export function signAccessToken(userId: string, sessionId: string): string {
  return jwt.sign({ sid: sessionId } satisfies Omit<AccessClaims, 'sub'>, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
    algorithm: 'HS256',
    issuer: 'expenseflow',
    audience: 'expenseflow-api',
  });
}

/**
 * Verifies the access token cookie and attaches `req.user`. The user id used by every
 * downstream query comes exclusively from here.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) return next(unauthorized());
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'expenseflow',
      audience: 'expenseflow-api',
    }) as jwt.JwtPayload & AccessClaims;
    if (!claims.sub || !claims.sid) return next(unauthorized());
    req.user = { id: claims.sub, sessionId: claims.sid };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(unauthorized('Session expired', 'TOKEN_EXPIRED'));
    next(unauthorized());
  }
};
