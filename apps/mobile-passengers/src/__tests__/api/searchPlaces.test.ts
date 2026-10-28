jest.mock('../../api/client', () => ({
  api: {
    get: jest.fn(),
  },
}));

import { api } from '../../api/client';
import { searchPlaces } from '../../api/passenger';

const mockGet = api.get as jest.Mock;

describe('searchPlaces', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockGet.mockReset();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns backend hits when the API returns places', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          description: 'Belgrano 10, Villa Dolores',
          place_id: 'api-1',
          lat: -31.94,
          lng: -65.18,
        },
      ],
    });

    const places = await searchPlaces('Belgrano', -31.945, -65.19);

    expect(places).toHaveLength(1);
    expect(places[0].place_id).toBe('api-1');
    expect(mockGet).toHaveBeenCalled();
  });

  it('sends Villa Dolores bias to backend when GPS lat/lng is missing (Destino Dique)', async () => {
    mockGet.mockResolvedValue({ data: [] });
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }) as unknown as typeof fetch;

    await searchPlaces('Dique');

    expect(mockGet).toHaveBeenCalled();
    const opts = mockGet.mock.calls[0][1] as { params?: { lat?: number; lng?: number } };
    expect(opts.params?.lat).toBeCloseTo(-31.9456, 2);
    expect(opts.params?.lng).toBeCloseTo(-65.1895, 2);
  });

  it('falls back to Photon when backend returns empty array', async () => {
    mockGet.mockResolvedValue({ data: [] });
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [-65.173, -31.952] },
            properties: {
              osm_id: 99,
              name: 'San Martín',
              osm_key: 'highway',
              city: 'Villa Dolores',
              state: 'Córdoba',
              country: 'Argentina',
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const places = await searchPlaces('San Martin', -31.945, -65.19);

    expect(places.length).toBeGreaterThan(0);
    expect(places[0].description).toMatch(/San Martín/);
    expect(globalThis.fetch).toHaveBeenCalled();
    const url = String((globalThis.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).toMatch(/photon\.komoot\.io/);
    expect(url).toMatch(/lat=-31/);
  });

  it('falls back to Photon when backend request fails (401/network)', async () => {
    mockGet.mockRejectedValue(new Error('Unauthorized'));
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [-65.19, -31.945] },
            properties: {
              osm_id: 7,
              name: 'Belgrano',
              osm_key: 'highway',
              city: 'Villa Dolores',
              country: 'Argentina',
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const places = await searchPlaces('Belgrano');

    expect(places.length).toBeGreaterThan(0);
    expect(places[0].description).toMatch(/Belgrano/);
  });

  it('biases Photon to Villa Dolores when no GPS lat/lng provided', async () => {
    mockGet.mockRejectedValue(new Error('fail'));
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }) as unknown as typeof fetch;

    await searchPlaces('Calle Falsa');

    const url = String((globalThis.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).toMatch(/lat=-31\.9/);
    expect(url).toMatch(/lon=-65\.1/);
  });

  it('does not fall back to Photon when the request is aborted', async () => {
    const abortErr = Object.assign(new Error('canceled'), {
      name: 'CanceledError',
      code: 'ERR_CANCELED',
    });
    mockGet.mockRejectedValue(abortErr);
    globalThis.fetch = jest.fn() as unknown as typeof fetch;

    await expect(searchPlaces('Belgrano', -31.9, -65.1)).rejects.toMatchObject({
      name: 'CanceledError',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fall back to Photon when AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    mockGet.mockRejectedValue(new Error('aborted'));
    globalThis.fetch = jest.fn() as unknown as typeof fetch;

    await expect(searchPlaces('Belgrano', -31.9, -65.1, controller.signal)).rejects.toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns Photon hits when backend fails and does not surface Photon soft-fail as throw when empty', async () => {
    mockGet.mockRejectedValue(new Error('Unauthorized'));
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }) as unknown as typeof fetch;

    await expect(searchPlaces('Nada', -31.9, -65.1)).resolves.toEqual([]);
  });

  it('returns [] when backend and Photon both fail (empty UI, not sticky abort-style error)', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Photon request failed'));

    await expect(searchPlaces('Belgrano', -31.9, -65.1)).resolves.toEqual([]);
  });
});
