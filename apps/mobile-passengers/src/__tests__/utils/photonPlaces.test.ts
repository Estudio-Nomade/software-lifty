import {
  DEFAULT_PLACE_BIAS,
  formatPhotonPlaceLabel,
  mapPhotonFeaturesToPlaces,
} from '../../utils/photonPlaces';

describe('formatPhotonPlaceLabel', () => {
  it('prefers street+number over POI name', () => {
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

  it('returns empty for missing features', () => {
    expect(mapPhotonFeaturesToPlaces({})).toEqual([]);
    expect(mapPhotonFeaturesToPlaces({ features: [] })).toEqual([]);
  });
});

describe('DEFAULT_PLACE_BIAS', () => {
  it('is Villa Dolores launch footprint (not BA / null island)', () => {
    expect(DEFAULT_PLACE_BIAS.lat).toBeCloseTo(-31.945, 2);
    expect(DEFAULT_PLACE_BIAS.lng).toBeCloseTo(-65.19, 2);
  });
});
