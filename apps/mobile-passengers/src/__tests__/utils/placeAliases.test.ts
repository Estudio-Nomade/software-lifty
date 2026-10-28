import {
  expandPlaceQueries,
  matchCatalogPlaces,
  mergePlaceResults,
  normalizePlaceQuery,
} from '../../utils/placeAliases';

describe('normalizePlaceQuery', () => {
  it('strips accents, connectors, collapses spaces', () => {
    expect(normalizePlaceQuery('  Dique  del  Fuerte  ')).toBe('dique fuerte');
    expect(normalizePlaceQuery('San Martín')).toBe('san martin');
  });
});

describe('expandPlaceQueries', () => {
  it('includes lago variant for Dique del Fuerte', () => {
    const qs = expandPlaceQueries('Dique del Fuerte');
    expect(qs.length).toBeGreaterThanOrEqual(1);
    expect(qs.length).toBeLessThanOrEqual(3);
    expect(qs.join(' ').toLowerCase()).toMatch(/lago/);
  });

  it('caps at 3 and dedupes', () => {
    const qs = expandPlaceQueries('Dique del Fuerte, Tandil');
    expect(qs.length).toBeLessThanOrEqual(3);
    const keys = qs.map((q) => q.toLowerCase().replace(/\s+/g, ' '));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not explode plain street query', () => {
    const qs = expandPlaceQueries('San Martin');
    expect(qs.length).toBe(1);
    expect(qs[0]).toMatch(/San Martin/i);
  });
});

describe('matchCatalogPlaces', () => {
  it('returns Tandil Lago del Fuerte for dique alias', () => {
    const hits = matchCatalogPlaces('Dique del Fuerte');
    expect(hits[0]?.place_id).toBe('catalog:tandil-lago-del-fuerte');
    expect(hits[0]?.lat).toBeCloseTo(-37.3456714, 4);
  });

  it('matches VD Terminal', () => {
    const hits = matchCatalogPlaces('Terminal');
    expect(hits.some((h) => h.place_id.includes('terminal'))).toBe(true);
  });
});

describe('mergePlaceResults', () => {
  it('dedupes by place_id', () => {
    const m = mergePlaceResults([
      [{ description: 'A', place_id: '1', lat: 1, lng: 2 }],
      [{ description: 'A2', place_id: '1', lat: 1, lng: 2 }],
    ]);
    expect(m).toHaveLength(1);
  });
});
