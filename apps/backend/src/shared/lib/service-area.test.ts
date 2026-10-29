import { describe, expect, test } from 'bun:test';
import { AppError } from './errors';
import {
  LAUNCH_CLUSTER_HUBS,
  assertTripInsideLaunchCluster,
  isInsideLaunchCluster,
} from './service-area';

describe('isInsideLaunchCluster', () => {
  test('true at each launch hub', () => {
    for (const hub of LAUNCH_CLUSTER_HUBS) {
      expect(isInsideLaunchCluster(hub.lat, hub.lng)).toBe(true);
    }
  });

  test('true near Villa Dolores (~5 km east)', () => {
    expect(isInsideLaunchCluster(-31.945, -65.14)).toBe(true);
  });

  test('true near San Pedro hub', () => {
    expect(isInsideLaunchCluster(-31.936553, -65.2189268)).toBe(true);
  });

  test('false for CABA', () => {
    expect(isInsideLaunchCluster(-34.6037, -58.3816)).toBe(false);
  });

  test('false for Tandil', () => {
    expect(isInsideLaunchCluster(-37.3456714, -59.1299263)).toBe(false);
  });

  test('false for Córdoba capital', () => {
    expect(isInsideLaunchCluster(-31.4201, -64.1888)).toBe(false);
  });

  test('false for NaN / non-finite', () => {
    expect(isInsideLaunchCluster(Number.NaN, -65.19)).toBe(false);
    expect(isInsideLaunchCluster(-31.94, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('assertTripInsideLaunchCluster', () => {
  test('allows VD pair', () => {
    expect(() =>
      assertTripInsideLaunchCluster(
        { lat: -31.9449, lng: -65.1906 },
        { lat: -31.9525, lng: -65.174 },
      ),
    ).not.toThrow();
  });

  test('rejects when destination is outside', () => {
    try {
      assertTripInsideLaunchCluster(
        { lat: -31.9449, lng: -65.1906 },
        { lat: -34.6037, lng: -58.3816 },
      );
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('OUT_OF_SERVICE_AREA');
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  test('rejects when origin is outside', () => {
    try {
      assertTripInsideLaunchCluster(
        { lat: -34.6037, lng: -58.3816 },
        { lat: -31.9449, lng: -65.1906 },
      );
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('OUT_OF_SERVICE_AREA');
    }
  });
});
