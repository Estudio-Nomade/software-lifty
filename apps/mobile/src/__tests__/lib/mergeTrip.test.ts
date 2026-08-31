import { mergeTripUpdate, unwrapTripPayload } from '../../lib/mergeTrip';
import type { Trip } from '../../api/types';

const baseTrip = {
  id: 't1',
  driver_id: 'd1',
  passenger_id: 'p1',
  status: 'waiting',
  origin_address: null,
  origin_lat: -31.4,
  origin_lng: -64.2,
  dest_address: null,
  dest_lat: -31.5,
  dest_lng: -64.3,
  pickup_instructions: null,
  distance_km: 5,
  duration_minutes: 12,
  base_fare: 1000,
  distance_fare: 500,
  time_fare: 200,
  total_fare: 1700,
  platform_fee: 200,
  driver_earnings: 1500,
  payment_method: null,
  is_collected: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  passenger_name: 'Sebastian Vallejo',
  passenger_avatar_url: null,
  passenger_phone: '2494011469',
  passenger_rating: 4.5,
  verification_code: '1234',
} as Trip;

describe('mergeTripUpdate', () => {
  it('unwraps nested data payloads', () => {
    expect(unwrapTripPayload({ data: { id: 'x', status: 'in_trip' } })).toMatchObject({
      id: 'x',
      status: 'in_trip',
    });
  });

  it('keeps passenger_name when mutation payload omits it', () => {
    const bare = {
      id: 't1',
      status: 'in_trip',
      passenger_id: 'p1',
      // no passenger_name
    };
    const merged = mergeTripUpdate(baseTrip, bare);
    expect(merged?.status).toBe('in_trip');
    expect(merged?.passenger_name).toBe('Sebastian Vallejo');
    expect(merged?.passenger_phone).toBe('2494011469');
    expect(merged?.passenger_rating).toBe(4.5);
  });

  it('keeps passenger_name when mutation payload sends null', () => {
    const bare = {
      id: 't1',
      status: 'in_trip',
      passenger_name: null,
      passenger_phone: null,
    };
    const merged = mergeTripUpdate(baseTrip, bare);
    expect(merged?.passenger_name).toBe('Sebastian Vallejo');
    expect(merged?.passenger_phone).toBe('2494011469');
  });

  it('accepts nested axios shape', () => {
    const merged = mergeTripUpdate(baseTrip, {
      data: { id: 't1', status: 'in_trip', total_fare: 2000 },
    });
    expect(merged?.status).toBe('in_trip');
    expect(merged?.total_fare).toBe(2000);
    expect(merged?.passenger_name).toBe('Sebastian Vallejo');
  });
});
