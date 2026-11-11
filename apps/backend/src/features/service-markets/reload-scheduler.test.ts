import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { getDb } from '../../shared/db/client';
import {
  getActiveServiceMarkets,
  resetServiceMarketsToLegacy,
} from '../../shared/lib/service-area';
import { startServiceMarketsReload } from './reload-scheduler';
import { reloadServiceMarketsCache } from './service';

const TANDIL_ROW = {
  id: 'test-tandil',
  slug: 'tandil',
  name: 'Tandil',
  province: 'Buenos Aires',
  status: 'active',
  hub_lat: -37.3217,
  hub_lng: -59.1332,
  pickup_radius_km: 8,
  dropoff_radius_km: 50,
  match_radius_km: 8,
  geo_bias_radius_km: 20,
};

/** Replaces `db.select().from().where()` so reloadServiceMarketsCache sees `rows` or a DB error. */
function stubMarketsQuery(result: { rows: unknown[] } | { error: Error }) {
  // db is a Proxy over getDb(); spying on the real instance is what the proxy reads.
  return spyOn(getDb(), 'select').mockImplementation((() => {
    if ('error' in result) throw result.error;
    return { from: () => ({ where: async () => result.rows }) };
  }) as never);
}

async function waitFor(cond: () => boolean, timeoutMs = 1_500): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const slugs = () => getActiveServiceMarkets().map((m) => m.slug);

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  resetServiceMarketsToLegacy();
});

describe('startServiceMarketsReload', () => {
  test('after a failed initial load, a later successful reload fills the cache from the DB', async () => {
    resetServiceMarketsToLegacy();

    const failing = stubMarketsQuery({ error: new Error('db down at boot') });
    expect(await reloadServiceMarketsCache()).toBe(-1);
    expect(slugs()).toEqual(['villa-dolores']); // stuck on legacy
    failing.mockRestore();

    const healthy = stubMarketsQuery({ rows: [TANDIL_ROW] });
    try {
      stop = startServiceMarketsReload({ intervalMs: 10 });
      await waitFor(() => slugs().includes('tandil'));
      expect(slugs()).toEqual(['tandil']);
    } finally {
      healthy.mockRestore();
    }
  });

  test('keeps ticking after a reload that throws or rejects', async () => {
    let calls = 0;
    stop = startServiceMarketsReload({
      intervalMs: 5,
      reload: async () => {
        calls += 1;
        if (calls < 3) throw new Error(`boom ${calls}`);
        return 1;
      },
    });
    await waitFor(() => calls >= 4);
    expect(calls).toBeGreaterThanOrEqual(4);
  });

  test('does not start a reload while the previous one is still running', async () => {
    let running = 0;
    let maxRunning = 0;
    let calls = 0;
    stop = startServiceMarketsReload({
      intervalMs: 5,
      reload: async () => {
        calls += 1;
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 40));
        running -= 1;
        return 0;
      },
    });
    await waitFor(() => calls >= 2);
    expect(maxRunning).toBe(1);
  });

  test('stop() cancels further reloads', async () => {
    let calls = 0;
    const stopFn = startServiceMarketsReload({
      intervalMs: 5,
      reload: async () => {
        calls += 1;
        return 0;
      },
    });
    await waitFor(() => calls >= 1);
    stopFn();
    const after = calls;
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toBe(after);
  });
});
