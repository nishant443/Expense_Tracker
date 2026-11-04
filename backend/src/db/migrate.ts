import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env';
import { closeDb, initDb } from './client';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Folder with SQL migrations; resolved for both `tsx src/...` and the bundled `dist/` build. */
export function migrationsFolder(): string {
  const candidates = [
    path.join(here, 'migrations'), // src/db (tsx) or dist/ (server bundle)
    path.join(here, '..', 'migrations'), // dist/db/migrate.js
    path.join(here, '..', 'src', 'db', 'migrations'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export async function runMigrations(url = env.DATABASE_URL): Promise<void> {
  const db = await initDb(url);
  if (url.startsWith('pglite:')) {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder: migrationsFolder() });
  } else {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db, { migrationsFolder: migrationsFolder() });
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  runMigrations()
    .then(async () => {
      // eslint-disable-next-line no-console
      console.log('✅ Migrations applied');
      await closeDb();
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error('❌ Migration failed', err);
      await closeDb();
      process.exit(1);
    });
}
