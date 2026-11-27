/**
 * @jest-environment node
 */
import { buildFixPayload } from '../../lib/locationCore';
import { useLocationStore } from '../../store/locationStore';

describe('buildFixPayload', () => {
  beforeEach(() => useLocationStore.getState().clearLocation());

  it('returns null when there is no fix', () => {
    expect(buildFixPayload()).toBeNull();
  });

  it('includes accuracy, speed and the device fix timestamp, omitting nulls', () => {
    const now = 1_700_000_000_000;
    useLocationStore.getState().setLocation(-31.9, -65.1, null, 8, 4.2, now - 1000);
    expect(buildFixPayload(now)).toEqual({
      lat: -31.9,
      lng: -65.1,
      accuracy: 8,
      speed: 4.2,
      timestamp: now - 1000,
    });
  });

  it('returns null when the stored fix is older than 10 s', () => {
    const now = 1_700_000_000_000;
    useLocationStore.getState().setLocation(-31.9, -65.1, 90, 8, null, now - 10_001);
    expect(buildFixPayload(now)).toBeNull();
  });
});
