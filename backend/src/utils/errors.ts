export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') => new AppError(401, code, message);
export const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message);
/** Used for missing AND not-owned resources so ids cannot be probed. */
export const notFound = (entity = 'Resource') => new AppError(404, 'NOT_FOUND', `${entity} not found`);
export const conflict = (message: string, code = 'CONFLICT', details?: unknown) => new AppError(409, code, message, details);
export const tooLarge = (message: string) => new AppError(413, 'PAYLOAD_TOO_LARGE', message);
export const unsupported = (message: string) => new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message);

/** Postgres unique_violation */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = pgError(err);
  return !!e && e.code === '23505' && (!constraint || e.constraint === constraint || String(e.message).includes(constraint));
}

/** Postgres foreign_key_violation */
export function isForeignKeyViolation(err: unknown): boolean {
  return pgError(err)?.code === '23503';
}

function pgError(err: unknown): { code?: string; constraint?: string; message?: string } | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: string; cause?: unknown };
  if (e.code) return e as { code?: string };
  if (e.cause) return pgError(e.cause);
  return null;
}
