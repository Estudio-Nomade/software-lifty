/**
 * Set platform_config.commission_rate (flat Lifty %).
 *
 *   bun run scripts/set-commission-rate.ts 0
 *   bun run scripts/set-commission-rate.ts 0.05
 *   bun run scripts/set-commission-rate.ts 5%
 *   DATABASE_URL=... bun run scripts/set-commission-rate.ts 0.05
 *
 * Bare numbers are fractions only (0–0.30). Percent requires `%` suffix.
 * See docs/runbooks/set-commission-rate.md
 */
import { getDb, resetDb } from '../src/shared/db/client';
import {
  COMMISSION_RATE_KEY,
  getConfig,
  parseCommissionRate,
  parseCommissionRateCliArg,
  setConfig,
  toRatePct,
} from '../src/shared/lib/commission';
import { notifyDriversCommissionRateChanged } from '../src/shared/lib/commission-rate-notify';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: bun run scripts/set-commission-rate.ts <0|0.05|5%>');
    console.error('  bare number = fraction 0–0.30; percent needs suffix (5% not 5)');
    process.exit(2);
  }

  const value = parseCommissionRateCliArg(arg);
  const rate = parseCommissionRate(value);
  const db = getDb();

  const prevRaw = await getConfig(db, COMMISSION_RATE_KEY);
  const prev = parseCommissionRate(prevRaw);

  await setConfig(db, COMMISSION_RATE_KEY, value);

  const nextRaw = await getConfig(db, COMMISSION_RATE_KEY);
  const next = parseCommissionRate(nextRaw);
  const changed = prev !== next;

  let notify: Awaited<ReturnType<typeof notifyDriversCommissionRateChanged>> | null = null;
  if (changed) {
    notify = await notifyDriversCommissionRateChanged(db, next);
  }

  console.log(
    JSON.stringify(
      {
        key: COMMISSION_RATE_KEY,
        previous: {
          raw: prevRaw || null,
          configured: Boolean(prevRaw),
          rate: prev,
          rate_pct: toRatePct(prev),
        },
        next: {
          raw: nextRaw,
          configured: true,
          rate: next,
          rate_pct: toRatePct(next),
        },
        changed,
        notify,
      },
      null,
      2,
    ),
  );

  resetDb();
}

main().catch((err) => {
  console.error('set-commission-rate failed:', (err as Error).message);
  resetDb();
  process.exit(1);
});
