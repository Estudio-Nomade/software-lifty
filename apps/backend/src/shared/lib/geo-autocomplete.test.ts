/**
 * Isolated unit tests for autocomplete helpers + Photon path.
 * Do NOT mock.module('./redis') — that poisons rate-limit / health for the whole suite.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
  autocomplete,
  autocompleteCacheKey,
  normalizeAutocompleteQuery,
} from './geo';

type FetchMock = ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;

describe('geo autocomplete helpers', () => {
  test('normalize collapses spaces and lowercases', () => {
    expect(normalizeAutocompleteQuery('  San  Martin  ')).toBe('san martin');
  });

  test('cache key buckets bias and ignores query casing/spacing', () => {
    const a = autocompleteCacheKey('San  Martin', -31.945, -65.189);
    const b = autocompleteCacheKey('san martin', -31.94, -65.19);
    expect(a).toBe(b);
    expect(a).toContain('geo:ac:v1:san martin:');
    expect(autocompleteCacheKey('x')).toContain(':none:none');
  });
});

describe('geo.autocomplete Photon path', () => {
  let fetchSpy: FetchMock;
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    prevNodeEnv = process.env.NODE_ENV;
    // Bypass the NODE_ENV=test short-circuit mock so we exercise real Photon path.
    process.env.NODE_ENV = 'development';
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        Response.json({
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
        })) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  test('lang=default is sent to Photon', async () => {
    await autocomplete('san martin');
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('lang=default');
    expect(calledUrl).not.toContain('lang=es');
  });

  test('maps Photon features to PlaceResult', async () => {
    const results = await autocomplete(`place-map-${Date.now()}`, -31.94, -65.19);
    expect(results).toHaveLength(1);
    expect(results[0].place_id).toBe('1');
    expect(results[0].lat).toBe(-31.94);
    expect(results[0].lng).toBe(-65.19);
    expect(results[0].description).toContain('Villa Dolores');
  });

  test('timeout / fetch failure returns empty array fast', async () => {
    fetchSpy.mockImplementation(
      (async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }) as unknown as typeof fetch,
    );
    const t0 = Date.now();
    const results = await autocomplete(`timeout-q-${Date.now()}`);
    expect(results).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
