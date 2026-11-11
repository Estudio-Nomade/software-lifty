import { logger } from '../../shared/lib/logger';
import { reloadServiceMarketsCache } from './service';

/** Same TTL as `CACHE_TTL_MS` in apps/mobile/src/lib/serviceArea.ts. */
export const SERVICE_MARKETS_RELOAD_INTERVAL_MS = 5 * 60 * 1000;

type ReloadOptions = {
  intervalMs?: number;
  /** Injectable for tests; defaults to the real DB-backed reload. */
  reload?: () => Promise<number>;
};

/**
 * Periodically refreshes the in-memory service-markets cache so a failed boot
 * load (or a change made by another process) is picked up without a restart.
 *
 * `reloadServiceMarketsCache` already swallows DB errors, but this wrapper also
 * guards against a rejecting `reload` and skips a tick while the previous one
 * is still running. Returns a function that stops the schedule.
 */
export function startServiceMarketsReload(options: ReloadOptions = {}): () => void {
  const { intervalMs = SERVICE_MARKETS_RELOAD_INTERVAL_MS, reload = reloadServiceMarketsCache } =
    options;
  let running = false;

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    Promise.resolve()
      .then(reload)
      .catch((err) => {
        logger.warn('[service-markets] periodic reload failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
