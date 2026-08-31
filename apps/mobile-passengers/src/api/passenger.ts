import { api } from './client';
import type { FareEstimate, PassengerProfile, PlaceSuggestion, Trip, TripMessage } from './types';

export async function registerPassenger(
  phone?: string,
  fullName?: string,
): Promise<PassengerProfile> {
  const body: { phone?: string; full_name?: string } = {};
  if (phone) body.phone = phone;
  if (fullName?.trim()) body.full_name = fullName.trim();
  const { data } = await api.post<PassengerProfile>('/passenger/register', body);
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

export async function uploadProfilePhoto(
  uri: string,
  fileName = 'avatar.jpg',
  mimeType = 'image/jpeg',
): Promise<{ file_url: string; avatar_url: string }> {
  const formData = new FormData();
  formData.append('file', { uri, type: mimeType, name: fileName } as unknown as Blob);

  const { data } = await api.post<{ file_url: string; avatar_url: string }>(
    '/passenger/profile/photo',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );

  return data;
}

export async function estimateFare(params: {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  vehicle_type: 'auto' | 'moto';
}): Promise<FareEstimate> {
  const { data } = await api.post<{
    total: number;
    distance_km: number;
    duration_minutes: number;
  }>('/maps/fare-estimate', {
    origin_lat: params.origin_lat,
    origin_lng: params.origin_lng,
    dest_lat: params.dest_lat,
    dest_lng: params.dest_lng,
    vehicle_type: params.vehicle_type === 'moto' ? 'motorcycle' : 'car',
  });
  return {
    fare: data.total,
    distance_km: data.distance_km,
    duration_min: data.duration_minutes,
    vehicle_type: params.vehicle_type,
  };
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
  payment_method?: 'cash' | 'transfer';
}): Promise<Trip> {
  const { data } = await api.post<Trip | { error?: { message?: string; code?: string } }>(
    '/passenger/trips/request',
    params,
  );
  // safeCall can return { error } with a non-throwing status in some paths.
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(data.error.message || data.error.code || 'No se pudo solicitar el viaje');
  }
  const trip = data as Trip;
  if (!trip?.id) {
    throw new Error('Respuesta inválida del servidor al crear el viaje');
  }
  return trip;
}

export async function setTripPaymentMethod(
  tripId: string,
  payment_method: 'cash' | 'transfer',
): Promise<Trip> {
  const { data } = await api.post<Trip>(`/passenger/trips/${tripId}/payment-method`, {
    payment_method,
  });
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

/** Reverse geocode (coords → street name). Uses backend Photon proxy — works on web. */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ lat: number; lng: number; formatted_address: string }> {
  const { data } = await api.get<{ lat: number; lng: number; formatted_address: string }>(
    '/maps/geocode',
    { params: { lat, lng } },
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

export async function getCancelPreview(rideId: string) {
  const { data } = await api.get(`/passenger/trips/${rideId}/cancel-preview`);
  return data as {
    can_cancel: boolean;
    fee_ars: number;
    copy: string;
    collection_phase: 1 | 2;
  };
}

export async function getPassengerDebt() {
  const { data } = await api.get('/passenger/trips/debt');
  return data as { amount_ars: number; status: string };
}

export async function retryRide(rideId: string): Promise<{ drivers_found: number; trip: Trip }> {
  const { data } = await api.post<{ drivers_found: number; trip: Trip }>(
    `/passenger/trips/${rideId}/retry`,
  );
  return data;
}

export async function rateRide(rideId: string, rating: number, comment?: string): Promise<void> {
  await api.post(`/passenger/trips/${rideId}/rate`, { rating, comment });
}

export async function listTripMessages(tripId: string): Promise<TripMessage[]> {
  const { data } = await api.get<TripMessage[]>(`/passenger/trips/${tripId}/messages`);
  return Array.isArray(data) ? data : ((data as { data?: TripMessage[] })?.data ?? []);
}

export async function sendTripMessage(tripId: string, text: string): Promise<TripMessage> {
  const { data } = await api.post<TripMessage>(`/passenger/trips/${tripId}/messages`, { text });
  return (data as { data?: TripMessage })?.data ?? data;
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
