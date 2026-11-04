import cron from 'node-cron';
import { authService } from '../services/auth.service';
import { recurringService } from '../services/recurring.service';
import { logger } from '../utils/logger';

let running = false;

/** Runs due recurring rules; guarded against overlapping executions in one process. */
export async function runRecurringJob(): Promise<void> {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const created = await recurringService.processDue();
    if (created) logger.info({ created, ms: Date.now() - started }, 'Recurring transactions processed');
  } catch (err) {
    logger.error({ err }, 'Recurring job failed');
  } finally {
    running = false;
  }
}

export function startScheduler(): () => void {
  const tasks = [
    // Every 15 minutes: fine-grained enough for per-user timezones crossing midnight.
    cron.schedule('*/15 * * * *', () => void runRecurringJob()),
    // Daily housekeeping.
    cron.schedule('17 3 * * *', () => void authService.purgeExpired().catch((err) => logger.error({ err }, 'Cleanup failed'))),
  ];
  void runRecurringJob();
  return () => tasks.forEach((t) => t.stop());
}
