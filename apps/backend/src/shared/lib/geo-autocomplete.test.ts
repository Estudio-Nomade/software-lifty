/**
 * Isolated unit tests for autocomplete helpers + Photon path.
 * Do NOT mock.module('./redis') — that poisons rate-limit / health for the whole suite.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
  autocomplete,
  autocompleteCacheKey,
  formatPhotonAddress,
  normalizeAutocompleteQuery,
  rankPhotonPlaceFeatures,
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
    expect(a).toContain('geo:ac:v2:san martin:');
    expect(autocompleteCacheKey('x')).toContain(':none:none');
  });
});

describe('formatPhotonAddress POI vs street', () => {
  test('POI keeps name when street is also present', () => {
    expect(
      formatPhotonAddress({
        name: 'Dique seco De los Curas',
        street: 'Camino del Lago',
        osm_key: 'waterway',
        osm_value: 'dam',
        city: 'Tandil',
        country: 'Argentina',
      }),
    ).toContain('Dique seco De los Curas');
  });

  test('highway uses name as street', () => {
    expect(
      formatPhotonAddress({
        name: 'San Martín',
        osm_key: 'highway',
        city: 'Villa Dolores',
        country: 'Argentina',
      }),
    ).toMatch(/^San Martín/);
  });
});

describe('rankPhotonPlaceFeatures', () => {
  test('prefers nearer match', () => {
    const ranked = rankPhotonPlaceFeatures(
      [
        {
          geometry: { coordinates: [124.07, 9.6] },
          properties: { osm_id: 1, name: 'Calvario', osm_key: 'place' },
        },
        {
          geometry: { coordinates: [-59.15, -37.32] },
          properties: { osm_id: 2, name: 'Parque Calvario', osm_key: 'place', city: 'Tandil' },
        },
      ],
      'Calvario',
      -37.32,
      -59.13,
    );
    expect(ranked[0].properties.osm_id).toBe(2);
  });

  test('Dique near Villa Dolores outranks far homonym with VD bias', () => {
    const ranked = rankPhotonPlaceFeatures(
      [
        {
          geometry: { coordinates: [-58.36, -34.61] },
          properties: { osm_id: 10, name: 'Dique', osm_key: 'place' },
        },
        {
          geometry: { coordinates: [-65.1126, -31.9131] },
          properties: {
            osm_id: 11,
            name: 'Dique Nivelador Boca del Río',
            osm_key: 'waterway',
            osm_value: 'dam',
          },
        },
      ],
      'Dique',
      -31.9456,
      -65.1895,
    );
    expect(ranked[0].properties.osm_id).toBe(11);
    expect(ranked[0].properties.name).toMatch(/Dique Nivelador/i);
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

  test('without GPS still biases Photon toward Villa Dolores launch footprint', async () => {
    await autocomplete(`dique-bias-${Date.now()}`);
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    const u = new URL(calledUrl);
    expect(Number(u.searchParams.get('lat'))).toBeCloseTo(-31.9456, 2);
    expect(Number(u.searchParams.get('lon'))).toBeCloseTo(-65.1895, 2);
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
