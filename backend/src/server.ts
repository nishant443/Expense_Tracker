import { env } from './config/env';
import { createApp } from './app';
import { closeDb } from './db/client';
import { runMigrations } from './db/migrate';
import { startScheduler } from './jobs/scheduler';
import { logger } from './utils/logger';

async function main() {
  // Applies pending migrations at boot (idempotent). Safe for single-region deployments;
  // for multi-instance rollouts run `npm run db:migrate` as a release step instead.
  await runMigrations();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`🚀 ExpenseFlow API listening on :${env.PORT} (${env.NODE_ENV})`));
  const stopJobs = env.DISABLE_JOBS ? () => {} : startScheduler();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopJobs();
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
