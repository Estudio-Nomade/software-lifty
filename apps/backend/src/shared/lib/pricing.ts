import { AppError } from './errors';

type VehicleType = 'car' | 'motorcycle';

const PRICING = {
  car: { base: 950, perMinute: 68, minimumFare: 1890 },
  motorcycle: { base: 650, perMinute: 50, minimumFare: 1690 },
} as const;

function getPerKmRate(vehicle: VehicleType, distanceKm: number): number {
  if (distanceKm <= 6) {
    return vehicle === 'car' ? 340 : 255;
  }
  if (distanceKm <= 11) {
    return vehicle === 'car' ? 390 : 300;
  }
  return vehicle === 'car' ? 440 : 330;
}

export interface FareInput {
  vehicle_type: string;
  distance_km: number;
  duration_minutes: number;
  commission_rate?: number;
}

export interface FareResult {
  base_fare: number;
  distance_fare: number;
  time_fare: number;
  total: number;
  platform_fee: number;
  driver_earnings: number;
}

export function calculatePlatformFee(total: number, commissionRate = 0.2): number {
  return Math.round(total * commissionRate * 100) / 100;
}

export function calculateFare(input: FareInput): FareResult {
  if (input.vehicle_type !== 'car' && input.vehicle_type !== 'motorcycle') {
    throw new AppError('Invalid vehicle type', 400, 'BAD_REQUEST');
  }
  if (input.distance_km <= 0) {
    throw new AppError('Distance must be positive', 400, 'BAD_REQUEST');
  }
  if (input.duration_minutes <= 0) {
    throw new AppError('Duration must be positive', 400, 'BAD_REQUEST');
  }

  const rates = PRICING[input.vehicle_type];
  const perKm = getPerKmRate(input.vehicle_type, input.distance_km);
  const commissionRate = input.commission_rate ?? 0.2;

  const base_fare = rates.base;
  const distance_fare = Math.round(input.distance_km * perKm * 100) / 100;
  const time_fare = Math.round(input.duration_minutes * rates.perMinute * 100) / 100;
  let total = Math.round(base_fare + distance_fare + time_fare);

  if ('minimumFare' in rates && total < rates.minimumFare) {
    total = rates.minimumFare;
  }

  const platform_fee = calculatePlatformFee(total, commissionRate);
  const driver_earnings = total - platform_fee;

  return { base_fare, distance_fare, time_fare, total, platform_fee, driver_earnings };
}
