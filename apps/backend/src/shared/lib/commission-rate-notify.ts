import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { driverAccountMessages, drivers, platformConfig } from '../db/schema';
import {
  COMMISSION_RATE_LAST_NOTIFIED_KEY,
  formatCommissionRateStored,
  formatRatePctLabel,
  toRatePct,
} from './commission';
import { logger } from './logger';
import { sendPushToUserDetailed } from './push';

export const COMMISSION_RATE_CHANGE_MESSAGE_TYPE = 'commission_rate_change';
export const COMMISSION_RATE_CHANGE_PUSH_TYPE = 'driver:commission_rate_change';

export function commissionRateChangeBody(rate: number): string {
  const n = formatRatePctLabel(toRatePct(rate));
  return `A partir de ahora, la comisión de Lifty es del ${n}% por viaje. Tu tarifa al pasajero no cambia. Podés consultar tu comisión actual en la sección Cobros.`;
}

export function commissionRateChangePush(rate: number, messageId?: string | null) {
  const n = formatRatePctLabel(toRatePct(rate));
  const body = commissionRateChangeBody(rate);
  const data: Record<string, string> = {
    type: COMMISSION_RATE_CHANGE_PUSH_TYPE,
    rate_pct: n,
  };
  if (messageId) data.message_id = messageId;
  return {
    title: 'Actualización de tu comisión',
    body,
    data,
    channelId: 'account' as const,
    app: 'driver' as const,
  };
}

export interface NotifyCommissionRateResult {
  drivers: number;
  messages: number;
  push_sent: number;
  push_failed: number;
  push_zero_tokens: number;
  /** True when last_notified already equals this rate (no fan-out). */
  skipped: boolean;
}

const CONCURRENCY = 8;

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Claim fan-out for this rate. Concurrent callers with the same rate: only one wins.
 * Returns false if this exact stored rate was already claimed/notified.
 */
export async function claimCommissionRateNotify(
  db: NodePgDatabase,
  rate: number,
): Promise<boolean> {
  const stored = formatCommissionRateStored(rate);
  // Atomic: only update when value changes (or insert first time).
  const result = await db.execute(sql`
    INSERT INTO platform_config (key, value)
    VALUES (${COMMISSION_RATE_LAST_NOTIFIED_KEY}, ${stored})
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = now()
      WHERE platform_config.value IS DISTINCT FROM EXCLUDED.value
    RETURNING key
  `);
  const rows = (result as { rows?: unknown[] }).rows ?? [];
  return rows.length > 0;
}

/**
 * Fan-out to approved drivers: inbox row + push.
 * Push failure does not skip inbox insert (insert first, then push stamp).
 * Idempotent vs last notified rate (script/admin race / double invoke).
 */
export async function notifyDriversCommissionRateChanged(
  db: NodePgDatabase,
  rate: number,
): Promise<NotifyCommissionRateResult> {
  const empty: NotifyCommissionRateResult = {
    drivers: 0,
    messages: 0,
    push_sent: 0,
    push_failed: 0,
    push_zero_tokens: 0,
    skipped: true,
  };

  const claimed = await claimCommissionRateNotify(db, rate);
  if (!claimed) {
    logger.info('[commission-rate-notify] skip — already notified this rate', {
      rate: formatCommissionRateStored(rate),
    });
    return empty;
  }

  const approved = await db
    .select({ id: drivers.id, user_id: drivers.user_id })
    .from(drivers)
    .where(eq(drivers.status, 'approved'));

  const body = commissionRateChangeBody(rate);
  let push_sent = 0;
  let push_failed = 0;
  let push_zero_tokens = 0;
  let messages = 0;

  await mapPool(approved, CONCURRENCY, async (driver) => {
    try {
      const [inserted] = await db
        .insert(driverAccountMessages)
        .values({
          driver_id: driver.id,
          type: COMMISSION_RATE_CHANGE_MESSAGE_TYPE,
          body,
        })
        .returning({ id: driverAccountMessages.id });

      if (!inserted) return;
      messages += 1;

      const push = commissionRateChangePush(rate, inserted.id);
      let pushStatus = 'failed';
      try {
        const result = await sendPushToUserDetailed(driver.user_id, push);
        pushStatus = result.status;
        if (result.status === 'sent') push_sent += 1;
        else if (result.status === 'zero_tokens') push_zero_tokens += 1;
        else push_failed += 1;
      } catch (err) {
        push_failed += 1;
        pushStatus = 'failed';
        logger.warn('[commission-rate-notify] push failed', {
          driver_id: driver.id,
          error: (err as Error).message,
        });
      }

      await db
        .update(driverAccountMessages)
        .set({ push_status: pushStatus })
        .where(eq(driverAccountMessages.id, inserted.id));
    } catch (err) {
      logger.error('[commission-rate-notify] message insert failed', {
        driver_id: driver.id,
        error: (err as Error).message,
      });
    }
  });

  return {
    drivers: approved.length,
    messages,
    push_sent,
    push_failed,
    push_zero_tokens,
    skipped: false,
  };
}

/** Test helper: clear notify claim marker. */
export async function clearCommissionRateNotifyClaim(db: NodePgDatabase): Promise<void> {
  await db.delete(platformConfig).where(eq(platformConfig.key, COMMISSION_RATE_LAST_NOTIFIED_KEY));
}
