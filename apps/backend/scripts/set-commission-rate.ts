/**
 * Set platform_config.commission_rate (flat Lifty %).
 *
 *   bun run scripts/set-commission-rate.ts 0
 *   bun run scripts/set-commission-rate.ts 0.05
 *   bun run scripts/set-commission-rate.ts 5%
 *   DATABASE_URL=... bun run scripts/set-commission-rate.ts 0.05
 *
 * See docs/runbooks/set-commission-rate.md
 */
import { getDb, resetDb } from '../src/shared/db/client';
import {
  COMMISSION_RATE_KEY,
  COMMISSION_RATE_SOFT_CAP,
  getConfig,
  parseCommissionRate,
  setConfig,
  toRatePct,
} from '../src/shared/lib/commission';

function parseArg(raw: string): string {
  const t = raw.trim();
  if (!t) throw new Error('empty rate');
  if (t.endsWith('%')) {
    const pct = Number.parseFloat(t.slice(0, -1));
    if (!Number.isFinite(pct) || pct < 0) throw new Error(`invalid percent: ${raw}`);
    const fraction = pct / 100;
    if (fraction > COMMISSION_RATE_SOFT_CAP) {
      throw new Error(`rate above soft cap ${COMMISSION_RATE_SOFT_CAP} (got ${fraction})`);
    }
    return String(fraction);
  }
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid rate: ${raw}`);
  if (n > COMMISSION_RATE_SOFT_CAP) {
    throw new Error(`rate above soft cap ${COMMISSION_RATE_SOFT_CAP} (got ${n})`);
  }
  // store canonical short string
  return String(n);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: bun run scripts/set-commission-rate.ts <0|0.05|5%>');
    process.exit(2);
  }

  const value = parseArg(arg);
  const rate = parseCommissionRate(value);
  const db = getDb();

  const prevRaw = await getConfig(db, COMMISSION_RATE_KEY);
  const prev = parseCommissionRate(prevRaw);

  await setConfig(db, COMMISSION_RATE_KEY, value);

  const nextRaw = await getConfig(db, COMMISSION_RATE_KEY);
  const next = parseCommissionRate(nextRaw);

  console.log(
    JSON.stringify(
      {
        key: COMMISSION_RATE_KEY,
        previous: { raw: prevRaw || null, rate: prev, rate_pct: toRatePct(prev) },
        next: { raw: nextRaw, rate: next, rate_pct: toRatePct(next) },
        changed: prev !== next,
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
