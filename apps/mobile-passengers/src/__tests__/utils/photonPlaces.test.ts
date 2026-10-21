import {
  DEFAULT_PLACE_BIAS,
  formatPhotonPlaceLabel,
  mapPhotonFeaturesToPlaces,
  rankPhotonFeatures,
  searchPhotonPlaces,
} from '../../utils/photonPlaces';

describe('formatPhotonPlaceLabel', () => {
  it('prefers street+number for address features', () => {
    expect(
      formatPhotonPlaceLabel({
        name: 'Someone',
        street: 'Belgrano',
        housenumber: '120',
        city: 'Villa Dolores',
        state: 'Córdoba',
        country: 'Argentina',
      }),
    ).toBe('Belgrano 120, Villa Dolores, Córdoba, Argentina');
  });

  it('uses highway name as street', () => {
    expect(
      formatPhotonPlaceLabel({
        name: 'San Martín',
        osm_key: 'highway',
        city: 'Villa Dolores',
        state: 'Córdoba',
        country: 'Argentina',
      }),
    ).toBe('San Martín, Villa Dolores, Córdoba, Argentina');
  });

  it('keeps POI name even when street is present (amenity/tourism)', () => {
    expect(
      formatPhotonPlaceLabel({
        name: 'Dique seco De los Curas',
        street: 'Camino del Lago',
        osm_key: 'waterway',
        osm_value: 'dam',
        city: 'Tandil',
        state: 'Buenos Aires',
        country: 'Argentina',
      }),
    ).toBe('Dique seco De los Curas, Tandil, Buenos Aires, Argentina');
  });

  it('labels named leisure/tourism without street', () => {
    expect(
      formatPhotonPlaceLabel({
        name: 'Monte Calvario',
        osm_key: 'natural',
        osm_value: 'peak',
        city: 'Tandil',
        country: 'Argentina',
      }),
    ).toBe('Monte Calvario, Tandil, Argentina');
  });
});

describe('mapPhotonFeaturesToPlaces', () => {
  it('maps GeoJSON features to PlaceSuggestion list with coords', () => {
    const places = mapPhotonFeaturesToPlaces({
      features: [
        {
          geometry: { coordinates: [-65.19, -31.945] },
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
    });

    expect(places).toHaveLength(1);
    expect(places[0].description).toMatch(/San Martín/);
    expect(places[0].lat).toBeCloseTo(-31.945, 3);
    expect(places[0].lng).toBeCloseTo(-65.19, 2);
    expect(places[0].place_id).toBe('1');
  });

  it('keeps amenity/tourism POIs with name-only properties', () => {
    const places = mapPhotonFeaturesToPlaces({
      features: [
        {
          geometry: { coordinates: [-59.15, -37.32] },
          properties: {
            osm_id: 42,
            name: 'Calvario',
            osm_key: 'tourism',
            osm_value: 'attraction',
            city: 'Tandil',
            country: 'Argentina',
          },
        },
      ],
    });
    expect(places).toHaveLength(1);
    expect(places[0].description).toMatch(/^Calvario/);
    expect(places[0].lat).toBeCloseTo(-37.32, 2);
  });

  it('returns empty for missing features', () => {
    expect(mapPhotonFeaturesToPlaces({})).toEqual([]);
    expect(mapPhotonFeaturesToPlaces({ features: [] })).toEqual([]);
  });
});

describe('rankPhotonFeatures', () => {
  it('prefers nearer name match over far homonym', () => {
    const ranked = rankPhotonFeatures(
      [
        {
          geometry: { coordinates: [124.07, 9.6] },
          properties: { name: 'Calvario', osm_key: 'place', osm_value: 'village' },
        },
        {
          geometry: { coordinates: [-59.15, -37.32] },
          properties: {
            name: 'Parque Calvario',
            osm_key: 'place',
            osm_value: 'suburb',
            city: 'Tandil',
          },
        },
      ],
      'Calvario',
      -37.32,
      -59.13,
    );
    expect(ranked[0].properties?.name).toMatch(/Calvario/);
    expect(ranked[0].geometry?.coordinates?.[0]).toBeCloseTo(-59.15, 1);
  });
});

describe('DEFAULT_PLACE_BIAS', () => {
  it('is Villa Dolores launch footprint (not BA / null island)', () => {
    expect(DEFAULT_PLACE_BIAS.lat).toBeCloseTo(-31.945, 2);
    expect(DEFAULT_PLACE_BIAS.lng).toBeCloseTo(-65.19, 2);
  });
});

describe('searchPhotonPlaces timeout/abort', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rethrows AbortError when the caller signal aborts (no silent empty)', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const onAbort = () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (init?.signal?.aborted) {
          onAbort();
          return;
        }
        init?.signal?.addEventListener('abort', onAbort, { once: true });
      });
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    const pending = searchPhotonPlaces('Dique', -31.9, -65.1, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws on non-OK Photon HTTP so callers can show network error (not false empty)', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(searchPhotonPlaces('Dique', -31.9, -65.1)).rejects.toThrow(/Photon/i);
  });

  it('throws timeout error (not silent []) when local deadline fires without caller abort', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn().mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          },
          { once: true },
        );
      });
    }) as unknown as typeof fetch;

    const pending = searchPhotonPlaces('Dique', -31.9, -65.1);
    const assertion = expect(pending).rejects.toThrow(/Photon timeout/i);
    await jest.advanceTimersByTimeAsync(4000);
    await assertion;
    jest.useRealTimers();
  });
});
