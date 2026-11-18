import {
  COMPLETE_EXCEPTION_MAX_M,
  COMPLETE_OK_RADIUS_M,
} from '../../lib/completeException';
import {
  formatPinDistanceLabel,
  metersToDestPin,
  pinDistanceTone,
} from '../../lib/pinDistance';

describe('metersToDestPin', () => {
  it('returns null when GPS or dest is missing', () => {
    expect(metersToDestPin(null, -58.4, -34.6, -58.38)).toBeNull();
    expect(metersToDestPin(-34.6, null, -34.6, -58.38)).toBeNull();
    expect(metersToDestPin(-34.6, -58.4, null, -58.38)).toBeNull();
    expect(metersToDestPin(-34.6, -58.4, -34.6, null)).toBeNull();
  });

  it('returns rounded haversine meters to dest pin', () => {
    const meters = metersToDestPin(-34.6037, -58.3816, -34.6037, -58.3816);
    expect(meters).toBe(0);

    const nearby = metersToDestPin(-34.6037, -58.3816, -34.6046, -58.3816);
    expect(nearby).not.toBeNull();
    expect(nearby!).toBeGreaterThan(90);
    expect(nearby!).toBeLessThan(110);
  });
});

describe('formatPinDistanceLabel', () => {
  it('formats meters under 1 km with pin wording', () => {
    expect(formatPinDistanceLabel(85)).toContain('~85 m del pin');
    expect(formatPinDistanceLabel(85)).toContain('OK para finalizar');
  });

  it('formats kilometers with es-AR and pin wording', () => {
    const label = formatPinDistanceLabel(1200);
    expect(label).toMatch(/~1[,.]2 km del pin/);
    expect(label).toContain('muy lejos del pin');
  });

  it('adds mid-band exception hint between OK and hard max', () => {
    const label = formatPinDistanceLabel(COMPLETE_OK_RADIUS_M + 1);
    expect(label).toContain(`~${COMPLETE_OK_RADIUS_M + 1} m del pin`);
    expect(label).toContain(`>${COMPLETE_OK_RADIUS_M} m`);
    expect(label).toContain('puede pedir motivo');
  });

  it('marks hard far beyond exception max', () => {
    const label = formatPinDistanceLabel(COMPLETE_EXCEPTION_MAX_M + 1);
    expect(label).toContain('muy lejos del pin');
  });
});

describe('pinDistanceTone', () => {
  it('maps product radii to ok / warn / far', () => {
    expect(pinDistanceTone(COMPLETE_OK_RADIUS_M)).toBe('ok');
    expect(pinDistanceTone(COMPLETE_OK_RADIUS_M + 1)).toBe('warn');
    expect(pinDistanceTone(COMPLETE_EXCEPTION_MAX_M)).toBe('warn');
    expect(pinDistanceTone(COMPLETE_EXCEPTION_MAX_M + 1)).toBe('far');
  });
});
