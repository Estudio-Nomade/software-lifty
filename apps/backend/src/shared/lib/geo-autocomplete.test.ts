/**
 * Isolated unit tests for autocomplete helpers + Photon path.
 * Do NOT mock.module('./redis') — that poisons rate-limit / health for the whole suite.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
  autocomplete,
  autocompleteCacheKey,
  formatPhotonAddress,
  isBiasNearVillaDolores,
  normalizeAutocompleteQuery,
  parseGeoDefaultCoord,
  rankPhotonPlaceFeatures,
} from './geo';
import {
  expandPlaceQueries,
  mergePlaceResults,
  normalizePlaceQuery,
} from './place-aliases';
import { matchCatalogPlaces } from './places-catalog';

type FetchMock = ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;

describe('geo autocomplete helpers', () => {
  test('normalize collapses spaces and lowercases', () => {
    expect(normalizeAutocompleteQuery('  San  Martin  ')).toBe('san martin');
  });

  test('cache key is v3 (aliases/catalog) and buckets bias', () => {
    const a = autocompleteCacheKey('San  Martin', -31.945, -65.189);
    const b = autocompleteCacheKey('san martin', -31.94, -65.19);
    expect(a).toBe(b);
    expect(a).toContain('geo:ac:v3:san martin:');
    expect(a).not.toContain('geo:ac:v2:');
    expect(autocompleteCacheKey('x')).toContain(':none:none');
  });

  test('parseGeoDefaultCoord rejects NaN / empty and keeps finite overrides', () => {
    expect(parseGeoDefaultCoord(undefined, -31.9456)).toBe(-31.9456);
    expect(parseGeoDefaultCoord('', -31.9456)).toBe(-31.9456);
    expect(parseGeoDefaultCoord('  ', -31.9456)).toBe(-31.9456);
    expect(parseGeoDefaultCoord('not-a-number', -31.9456)).toBe(-31.9456);
    expect(parseGeoDefaultCoord('NaN', -65.1895)).toBe(-65.1895);
    expect(parseGeoDefaultCoord('-31.94', -31.9456)).toBeCloseTo(-31.94, 2);
  });
});

describe('place aliases', () => {
  test('normalizePlaceQuery strips accents and connectors', () => {
    expect(normalizePlaceQuery('  Dique  del  Fuerte  ')).toBe('dique fuerte');
    expect(normalizePlaceQuery('San Martín')).toBe('san martin');
  });

  test('expandPlaceQueries includes Lago del Fuerte for Dique del Fuerte', () => {
    const qs = expandPlaceQueries('Dique del Fuerte');
    expect(qs.length).toBeGreaterThanOrEqual(1);
    expect(qs.length).toBeLessThanOrEqual(3);
    const joined = qs.join(' | ').toLowerCase();
    expect(joined).toMatch(/lago/);
  });

  test('expandPlaceQueries caps at 3 and dedupes', () => {
    const qs = expandPlaceQueries('Dique del Fuerte, Tandil');
    expect(qs.length).toBeLessThanOrEqual(3);
    const lower = qs.map((q) => q.toLowerCase().replace(/\s+/g, ' '));
    expect(new Set(lower).size).toBe(lower.length);
  });

  test('mergePlaceResults dedupes by place_id and coords', () => {
    const merged = mergePlaceResults([
      [{ description: 'A', place_id: '1', lat: -31.94, lng: -65.19 }],
      [
        { description: 'A dup', place_id: '1', lat: -31.94, lng: -65.19 },
        { description: 'B', place_id: '2', lat: -31.95, lng: -65.18 },
      ],
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].place_id).toBe('1');
  });
});

describe('places catalog', () => {
  test('Tandil dique alias returns Lago del Fuerte catalog pin', () => {
    const hits = matchCatalogPlaces('Dique del Fuerte');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].place_id).toBe('catalog:tandil-lago-del-fuerte');
    expect(hits[0].lat).toBeCloseTo(-37.3456714, 4);
    expect(hits[0].lng).toBeCloseTo(-59.1299263, 4);
    expect(hits[0].description).toMatch(/Lago del Fuerte/i);
  });

  test('VD Terminal / Hospital catalog match near VD bias', () => {
    const bias = { biasLat: -31.9456, biasLng: -65.1895 };
    const t = matchCatalogPlaces('Terminal', undefined, bias);
    expect(t.some((h) => h.place_id.includes('terminal'))).toBe(true);
    const h = matchCatalogPlaces('Hospital', undefined, bias);
    expect(h.some((p) => p.description.toLowerCase().includes('hospital'))).toBe(true);
  });

  test('BA bias does not prepend VD Terminal catalog', () => {
    const hits = matchCatalogPlaces('Terminal', undefined, {
      biasLat: -34.6037,
      biasLng: -58.3816,
    });
    expect(hits.every((h) => !h.place_id.includes('vd-'))).toBe(true);
  });

  test('Dique del Fuerte still catalogs Tandil from VD bias (strong multi-token alias)', () => {
    const hits = matchCatalogPlaces('Dique del Fuerte', undefined, {
      biasLat: -31.9456,
      biasLng: -65.1895,
    });
    expect(hits.some((h) => h.place_id === 'catalog:tandil-lago-del-fuerte')).toBe(true);
  });

  test('no invented VD dique catalog row', () => {
    const hits = matchCatalogPlaces('Dique de Villa Dolores');
    expect(hits.every((h) => !h.place_id.includes('dique-vd'))).toBe(true);
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

  test('San Martin local highway outranks far homonym with VD bias + local boost', () => {
    expect(isBiasNearVillaDolores(-31.9456, -65.1895)).toBe(true);
    const ranked = rankPhotonPlaceFeatures(
      [
        {
          geometry: { coordinates: [-58.38, -34.6] },
          properties: {
            osm_id: 1,
            name: 'San Martín',
            osm_key: 'highway',
            city: 'Buenos Aires',
          },
        },
        {
          geometry: { coordinates: [-65.19, -31.945] },
          properties: {
            osm_id: 2,
            name: 'San Martín',
            osm_key: 'highway',
            city: 'Villa Dolores',
          },
        },
      ],
      'San Martin',
      -31.9456,
      -65.1895,
    );
    expect(ranked[0].properties.osm_id).toBe(2);
  });
});

describe('geo.autocomplete Photon path', () => {
  let fetchSpy: FetchMock;
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    prevNodeEnv = process.env.NODE_ENV;
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
                osm_key: 'highway',
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
    await autocomplete(`lang-check-${Date.now()}`);
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
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.place_id === '1')).toBe(true);
  });

  test('timeout / fetch failure returns empty array when no catalog match', async () => {
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

  test('alias Dique del Fuerte returns catalog Lago del Fuerte even if Photon empty', async () => {
    fetchSpy.mockImplementation(
      (async () => Response.json({ features: [] })) as unknown as typeof fetch,
    );
    const results = await autocomplete('Dique del Fuerte', -31.94, -65.19);
    expect(results.some((r) => /Lago del Fuerte/i.test(r.description))).toBe(true);
    expect(results.some((r) => String(r.place_id).startsWith('catalog:'))).toBe(true);
  });

  test('catalog alias stays first under VD bias even when Photon returns local noise', async () => {
    fetchSpy.mockImplementation(
      (async () =>
        Response.json({
          features: [
            {
              geometry: { coordinates: [-65.11, -31.91] },
              properties: {
                osm_id: 77,
                name: 'Dique Nivelador Boca del Río',
                osm_key: 'waterway',
                city: 'Villa Dolores',
                country: 'Argentina',
              },
            },
          ],
        })) as unknown as typeof fetch,
    );
    const results = await autocomplete('Dique del Fuerte', -31.9456, -65.1895);
    expect(results[0]?.place_id).toBe('catalog:tandil-lago-del-fuerte');
    expect(results[0]?.description).toMatch(/Lago del Fuerte/i);
  });

  test('expand fans out ≤3 Photon queries in parallel', async () => {
    await autocomplete('Dique del Fuerte', -31.94, -65.19);
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(3);
  });

  test('Terminal with VD bias includes local catalog or photon hit', async () => {
    fetchSpy.mockImplementation(
      (async () =>
        Response.json({
          features: [
            {
              geometry: { coordinates: [-58.38, -34.6] },
              properties: {
                osm_id: 99,
                name: 'Terminal',
                city: 'Buenos Aires',
                country: 'Argentina',
              },
            },
          ],
        })) as unknown as typeof fetch,
    );
    const results = await autocomplete('Terminal', -31.9456, -65.1895);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const top = results[0];
    expect(
      top.place_id.startsWith('catalog:') ||
        (top.lat > -32.1 && top.lat < -31.8 && top.lng > -65.4 && top.lng < -64.9),
    ).toBe(true);
  });
});
