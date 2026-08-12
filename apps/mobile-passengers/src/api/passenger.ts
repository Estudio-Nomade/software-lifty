import { api } from './client';
import type { FareEstimate, PassengerProfile, PlaceSuggestion, Trip } from './types';

export async function registerPassenger(phone?: string): Promise<PassengerProfile> {
  const { data } = await api.post<PassengerProfile>('/passenger/register', { phone });
  return data;
}

export async function getProfile(): Promise<PassengerProfile> {
  const { data } = await api.get<PassengerProfile>('/passenger/profile');
  return data;
}

export async function updateProfile(profile: Partial<PassengerProfile>): Promise<PassengerProfile> {
  const { data } = await api.put<PassengerProfile>('/passenger/profile', profile);
  return data;
}

export async function estimateFare(params: {
  pickup_lat: number;
  pickup_lng: number;
  destination_lat: number;
  destination_lng: number;
}): Promise<FareEstimate> {
  const { data } = await api.post<FareEstimate>('/passenger/rides/estimate', params);
  return data;
}

export async function requestRide(params: {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  origin_address: string;
  dest_address: string;
  vehicle_type: 'auto' | 'moto';
  distance_km: number;
  duration_minutes: number;
}): Promise<Trip> {
  const { data } = await api.post<Trip>('/passenger/trips/request', params);
  return data;
}

export async function getDirections(params: {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
}): Promise<{ distance_km: number; duration_minutes: number }> {
  const { data } = await api.get<{ distance_km: number; duration_minutes: number }>(
    '/maps/directions',
    { params },
  );
  return data;
}

export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
  formatted_address: string;
}> {
  const { data } = await api.get<{ lat: number; lng: number; formatted_address: string }>(
    '/maps/geocode',
    { params: { address } },
  );
  return data;
}

export async function getActiveRide(): Promise<Trip | null> {
  const { data } = await api.get<Trip | null>('/passenger/trips/active');
  return data;
}

export async function getRideHistory(page = 1, limit = 20): Promise<Trip[]> {
  const { data } = await api.get<Trip[]>('/passenger/trips/history', { params: { page, limit } });
  return data;
}

export async function getRideDetails(rideId: string): Promise<Trip> {
  const { data } = await api.get<Trip>(`/passenger/trips/${rideId}`);
  return data;
}

export async function cancelRide(rideId: string, reason?: string): Promise<void> {
  await api.post(`/passenger/trips/${rideId}/cancel`, { reason });
}

export async function rateRide(rideId: string, rating: number, comment?: string): Promise<void> {
  await api.post(`/passenger/trips/${rideId}/rate`, { rating, comment });
}

export async function searchPlaces(
  input: string,
  lat?: number,
  lng?: number,
): Promise<PlaceSuggestion[]> {
  const { data } = await api.get<PlaceSuggestion[]>('/maps/places/autocomplete', {
    params: { input, lat, lng },
  });
  return data;
}
