import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { badRequest, unauthorized } from './errors';

/** Wraps async handlers so rejections reach the central error handler (Express 4). */
export function asyncHandler<R extends Request = Request>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };
}

export function parseBody<S extends ZodTypeAny>(schema: S, req: Request): z.output<S> {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw badRequest('Validation failed', result.error.flatten());
  return result.data;
}

export function parseQuery<S extends ZodTypeAny>(schema: S, req: Request): z.output<S> {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) throw badRequest('Invalid query parameters', result.error.flatten());
  return result.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function paramId(req: Request, name = 'id'): string {
  const value = req.params[name];
  if (!value || !UUID_RE.test(value)) throw badRequest(`Invalid ${name}`);
  return value;
}

/** The authenticated user id — always from the verified token, never from client input. */
export function userId(req: Request): string {
  if (!req.user) throw unauthorized();
  return req.user.id;
}
