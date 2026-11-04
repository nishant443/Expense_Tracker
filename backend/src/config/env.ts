import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    /**
     * postgres://… (Neon pooled URL in production) or `pglite:<dir>` / `pglite:memory`
     * for a zero-setup local database.
     */
    DATABASE_URL: z.string().default('pglite:./.pglite'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).max(60).default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(24),
    /** Comma-separated list of allowed browser origins. */
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    /** Public URL of the frontend, used for links in emails. */
    APP_URL: z.string().url().default('http://localhost:5173'),
    /** 'lax' when frontend and API share a site (recommended, via rewrite proxy); 'none' for cross-site. */
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional(),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('ExpenseFlow <no-reply@expenseflow.app>'),
    DISABLE_JOBS: bool,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.JWT_ACCESS_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'Required in production (≥32 chars)' });
      }
      if (env.DATABASE_URL.startsWith('pglite:')) {
        ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Use a Postgres (Neon) URL in production' });
      }
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

export const env = {
  ...data,
  isProd: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  // Dev/test fallback secret — production requires an explicit one (validated above).
  JWT_ACCESS_SECRET: data.JWT_ACCESS_SECRET ?? 'dev-only-insecure-secret-change-me-0123456789',
  corsOrigins: data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
};
