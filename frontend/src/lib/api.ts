import type { ApiErrorBody } from '@expenseflow/shared';

/**
 * Only a public base URL lives in frontend env. Leave empty to use same-origin `/api`
 * (recommended: Vite proxy in dev, a rewrite in production).
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field errors from a Zod `flatten()` payload. */
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return d?.fieldErrors ?? {};
  }
}

export class NetworkError extends Error {
  constructor() {
    super("You're offline or the server is unreachable");
    this.name = 'NetworkError';
  }
}

export const isNetworkError = (e: unknown): e is NetworkError => e instanceof NetworkError;

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

export function setCsrfToken(token: string) {
  csrfToken = token;
}

function readCsrfCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)ef_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

async function ensureCsrf(force = false): Promise<string> {
  if (!force) {
    const fromCookie = readCsrfCookie();
    if (fromCookie) return (csrfToken = fromCookie);
    if (csrfToken) return csrfToken;
  }
  csrfPromise ??= fetch(`${BASE}/api/auth/csrf`, { credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) throw new ApiError(r.status, 'CSRF_FETCH_FAILED', 'Could not initialise session');
      const body = (await r.json()) as { csrfToken: string };
      csrfToken = body.csrfToken;
      return body.csrfToken;
    })
    .catch((e) => {
      if (e instanceof ApiError) throw e;
      throw new NetworkError();
    })
    .finally(() => (csrfPromise = null));
  return csrfPromise;
}

let refreshPromise: Promise<boolean> | null = null;

/** Single-flight refresh, serialised across tabs with the Web Locks API when available. */
function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    const run = async () => {
      const token = await ensureCsrf();
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': token },
      });
      if (res.ok) return true;
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      // Another tab rotated the token first — the browser already has the new cookies.
      return body?.error.code === 'REFRESH_RACE';
    };
    try {
      if ('locks' in navigator && navigator.locks) {
        return await navigator.locks.request('ef-auth-refresh', run);
      }
      return await run();
    } catch {
      return false;
    }
  })().finally(() => (refreshPromise = null));
  return refreshPromise;
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/csrf', '/auth/logout', '/auth/reset-password'];

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  raw?: boolean; // return Response instead of JSON
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}, attempt = 0): Promise<T> {
  const url = new URL(`${BASE}/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrf();

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      credentials: 'include',
      headers,
      signal: opts.signal,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new NetworkError();
  }

  if (res.status === 401 && attempt === 0 && !NO_REFRESH.some((p) => path.startsWith(p))) {
    if (await refreshSession()) return request<T>(method, path, opts, attempt + 1);
    onSessionExpired?.();
  }

  if (res.status === 403 && attempt === 0) {
    const body = (await res.clone().json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error.code === 'CSRF_INVALID') {
      await ensureCsrf(true);
      return request<T>(method, path, opts, attempt + 1);
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.error.code ?? 'HTTP_ERROR', body?.error.message ?? `Request failed (${res.status})`, body?.error.details);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  delete: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('DELETE', path, { ...opts, body }),
  /** Absolute URL for <img src> etc. */
  url: (path: string) => `${BASE}${path}`,
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
