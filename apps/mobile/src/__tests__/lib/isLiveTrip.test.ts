import { hasActiveTrip, isLiveTrip } from '../../lib/isLiveTrip';

const trip = (status: string, updatedAtMsAgo: number) => ({
  id: 'trip-1',
  driver_id: 'driver-1',
  passenger_id: null,
  status,
  origin_address: null,
  origin_lat: 0,
  origin_lng: 0,
  dest_address: null,
  dest_lat: 0,
  dest_lng: 0,
  pickup_instructions: null,
  distance_km: null,
  duration_minutes: null,
  base_fare: null,
  distance_fare: null,
  time_fare: null,
  total_fare: null,
  platform_fee: null,
  driver_earnings: null,
  payment_method: null,
  is_collected: false,
  created_at: new Date(Date.now() - updatedAtMsAgo).toISOString(),
  updated_at: new Date(Date.now() - updatedAtMsAgo).toISOString(),
  passenger_name: null,
  passenger_avatar_url: null,
  passenger_phone: null,
  passenger_rating: null,
  verification_code: null,
});

describe('isLiveTrip', () => {
  test('null trip is not live', () => {
    expect(isLiveTrip(null)).toBe(false);
  });

  test('a fresh waiting trip is live', () => {
    expect(isLiveTrip(trip('waiting', 60_000))).toBe(true);
  });

  test('a stale waiting trip (days old) is not live', () => {
    expect(isLiveTrip(trip('waiting', 5 * 24 * 60 * 60 * 1000))).toBe(false);
  });

  test('a fresh in_trip trip is live', () => {
    expect(isLiveTrip(trip('in_trip', 10 * 60 * 1000))).toBe(true);
  });

  test('a stale in_trip trip (days old) is not live', () => {
    expect(isLiveTrip(trip('in_trip', 5 * 24 * 60 * 60 * 1000))).toBe(false);
  });

  test('a terminal status is not live', () => {
    expect(isLiveTrip(trip('completed', 1_000))).toBe(false);
    expect(isLiveTrip(trip('cancelled', 1_000))).toBe(false);
  });
});

describe('hasActiveTrip', () => {
  test('null trip is not active', () => {
    expect(hasActiveTrip(null)).toBe(false);
  });

  test('active statuses are active', () => {
    expect(hasActiveTrip(trip('request_received', 0))).toBe(true);
    expect(hasActiveTrip(trip('offered', 0))).toBe(true);
    expect(hasActiveTrip(trip('accepted', 0))).toBe(true);
    expect(hasActiveTrip(trip('en_route', 0))).toBe(true);
    expect(hasActiveTrip(trip('waiting', 0))).toBe(true);
    expect(hasActiveTrip(trip('in_trip', 0))).toBe(true);
    expect(hasActiveTrip(trip('completed', 0))).toBe(true);
  });

  test('a stale-but-active trip is still active (no time heuristic)', () => {
    // A driver waiting >5min for the passenger still holds an active trip and
    // must not be redirected off the trip screens.
    expect(hasActiveTrip(trip('waiting', 10 * 60 * 1000))).toBe(true);
    expect(hasActiveTrip(trip('accepted', 24 * 60 * 60 * 1000))).toBe(true);
  });

  test('terminal statuses are not active', () => {
    expect(hasActiveTrip(trip('cancelled', 0))).toBe(false);
    expect(hasActiveTrip(trip('rejected', 0))).toBe(false);
    expect(hasActiveTrip(trip('expired', 0))).toBe(false);
  });
});
