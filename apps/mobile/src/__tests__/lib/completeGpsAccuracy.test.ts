import {
  COMPLETE_GPS_ACCURACY_MAX_M,
  applyLocationCoords,
  isGpsAccuracyTooLow,
  normalizeGpsAccuracyM,
} from '../../lib/locationCore';
import { useLocationStore } from '../../store/locationStore';

describe('complete GPS accuracy gate', () => {
  beforeEach(() => {
    useLocationStore.getState().clearLocation();
  });

  it('exposes COMPLETE_GPS_ACCURACY_MAX_M as 40m', () => {
    expect(COMPLETE_GPS_ACCURACY_MAX_M).toBe(40);
  });

  it('normalizeGpsAccuracyM keeps finite non-negative meters', () => {
    expect(normalizeGpsAccuracyM(12.5)).toBe(12.5);
    expect(normalizeGpsAccuracyM(0)).toBe(0);
    expect(normalizeGpsAccuracyM(null)).toBeNull();
    expect(normalizeGpsAccuracyM(undefined)).toBeNull();
    expect(normalizeGpsAccuracyM(Number.NaN)).toBeNull();
    expect(normalizeGpsAccuracyM(-1)).toBeNull();
  });

  it('isGpsAccuracyTooLow blocks only when accuracy is present and worse than max', () => {
    expect(isGpsAccuracyTooLow(null)).toBe(false);
    expect(isGpsAccuracyTooLow(undefined)).toBe(false);
    expect(isGpsAccuracyTooLow(25)).toBe(false);
    expect(isGpsAccuracyTooLow(40)).toBe(false);
    expect(isGpsAccuracyTooLow(40.1)).toBe(true);
    expect(isGpsAccuracyTooLow(80)).toBe(true);
    expect(isGpsAccuracyTooLow(60, 50)).toBe(true);
    expect(isGpsAccuracyTooLow(45, 50)).toBe(false);
  });

  it('applyLocationCoords persists accuracy and clears it when omitted', () => {
    expect(applyLocationCoords(-31.95, -65.42, 90, 18)).toBe(true);
    let state = useLocationStore.getState();
    expect(state.lat).toBeCloseTo(-31.95);
    expect(state.lng).toBeCloseTo(-65.42);
    expect(state.heading).toBe(90);
    expect(state.accuracy).toBe(18);

    expect(applyLocationCoords(-31.96, -65.43, null)).toBe(true);
    state = useLocationStore.getState();
    expect(state.accuracy).toBeNull();

    expect(applyLocationCoords(-31.97, -65.44, 10, 55)).toBe(true);
    expect(useLocationStore.getState().accuracy).toBe(55);

    useLocationStore.getState().clearLocation();
    expect(useLocationStore.getState().accuracy).toBeNull();
  });
});
