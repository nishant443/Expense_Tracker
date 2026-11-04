import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction — repositories accept either. */
export type Executor = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

let pool: pg.Pool | null = null;
let closeFn: (() => Promise<void>) | null = null;

// Return NUMERIC and DATE as strings (no float or timezone conversion).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => v);
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

async function createDb(url: string): Promise<DB> {
  if (url.startsWith('pglite:')) {
    // Local zero-setup Postgres (WASM). Not for production.
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
    const target = url.slice('pglite:'.length);
    const client = target === 'memory' ? new PGlite() : new PGlite(target);
    await client.waitReady;
    closeFn = () => client.close();
    // PGlite and node-postgres drizzle instances share the PgDatabase API surface.
    return drizzlePglite(client, { schema }) as unknown as DB;
  }

  pool = new pg.Pool({
    connectionString: url,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Neon requires TLS; `sslmode=require` in the URL also works.
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true },
  });
  closeFn = () => pool!.end();
  return drizzlePg(pool, { schema });
}

let dbPromise: Promise<DB> | null = null;
let dbInstance: DB | null = null;

export async function initDb(url = env.DATABASE_URL): Promise<DB> {
  if (!dbPromise) {
    dbPromise = createDb(url).then((d) => (dbInstance = d));
  }
  return dbPromise;
}

/** Synchronous accessor — valid after `initDb()` resolved (done at boot). */
export function db(): DB {
  if (!dbInstance) throw new Error('Database not initialised; call initDb() first');
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  await closeFn?.();
  dbPromise = null;
  dbInstance = null;
  closeFn = null;
  pool = null;
}

export { schema };
