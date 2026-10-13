process.env.NODE_ENV = 'development';

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

const redisStore = new Map<string, string>();

mock.module('./redis', () => ({
  getRedis: () => ({
    get: async (key: string) => redisStore.get(key) ?? null,
    setex: async (key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
    },
  }),
}));

const { autocomplete } = await import('./geo');

describe('geo.autocomplete cache + timeout', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    redisStore.clear();
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [-65.19, -31.94] },
              properties: {
                osm_id: 1,
                name: 'San Martín',
                city: 'Villa Dolores',
                state: 'Córdoba',
                country: 'Argentina',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('lang=default is sent to Photon', async () => {
    await autocomplete('san martin');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('lang=default');
    expect(calledUrl).not.toContain('lang=es');
  });

  test('second identical query is a Redis cache hit (no second fetch)', async () => {
    const first = await autocomplete('san martin villa dolores', -31.94, -65.19);
    expect(first.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await autocomplete('San  Martin  villa dolores', -31.94, -65.19);
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('timeout / fetch failure returns empty array fast', async () => {
    fetchSpy.mockImplementation(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const t0 = Date.now();
    const results = await autocomplete('calle que no existe xyz');
    expect(results).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
