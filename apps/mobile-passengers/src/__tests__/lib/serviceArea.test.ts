import {
  SERVICE_AREA_BODY,
  SERVICE_AREA_CITY,
  SERVICE_AREA_LABEL,
  SERVICE_AREA_TITLE,
} from '../../lib/serviceArea';

describe('serviceArea', () => {
  it('locks launch coverage copy to Villa Dolores, Córdoba', () => {
    expect(SERVICE_AREA_CITY).toBe('Villa Dolores');
    expect(SERVICE_AREA_LABEL).toContain('Villa Dolores');
    expect(SERVICE_AREA_LABEL).toContain('Córdoba');
    expect(SERVICE_AREA_TITLE.toLowerCase()).toContain('villa dolores');
    expect(SERVICE_AREA_BODY.toLowerCase()).toContain('conductores');
  });
});
