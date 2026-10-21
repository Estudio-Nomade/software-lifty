import { searchPhotonPlaces } from '../utils/photonPlaces';
import { api } from './client';
import type {
  DirectionsResult,
  FareEstimate,
  PassengerProfile,
  PlaceSuggestion,
  Trip,
  TripMessage,
} from './types';

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

function assertProfilePayload(data: unknown, action: string): PassengerProfile {
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: unknown }).error) {
    const err = (data as { error: { message?: string; code?: string } }).error;
    throw Object.assign(new Error(err.message || err.code || `No se pudo ${action}`), {
      response: { data },
    });
  }
  const profile = data as PassengerProfile | null;
  if (!profile || typeof profile !== 'object' || !profile.id) {
    throw new Error(`Respuesta inválida al ${action}`);
  }
  return profile;
}

export async function getProfile(): Promise<PassengerProfile> {
  const { data } = await api.get<PassengerProfile>('/passenger/profile');
  return assertProfilePayload(data, 'obtener el perfil');
}

export async function updateProfile(profile: Partial<PassengerProfile>): Promise<PassengerProfile> {
  const { data } = await api.put<PassengerProfile>('/passenger/profile', profile);
  return assertProfilePayload(data, 'guardar el perfil');
}

export async function uploadProfilePhoto(
  uri: string,
  fileName = 'avatar.jpg',
  mimeType = 'image/jpeg',
): Promise<{ file_url: string; avatar_url: string }> {
  const formData = new FormData();
  formData.append('file', { uri, type: mimeType, name: fileName } as unknown as Blob);

  // Drop default application/json so the runtime can set multipart boundary.
  const { data } = await api.post<{ file_url: string; avatar_url: string } | { error?: unknown }>(
    '/passenger/profile/photo',
    formData,
    {
      transformRequest: [
        (body, headers) => {
          if (headers && typeof headers === 'object') {
            const h = headers as Record<string, unknown>;
            h['Content-Type'] = undefined;
            h['content-type'] = undefined;
          }
          return body;
        },
      ],
    },
  );

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    const err = data.error as { message?: string; code?: string };
    throw Object.assign(new Error(err.message || err.code || 'No se pudo subir la foto'), {
      response: { data },
    });
  }
  const result = data as { file_url?: string; avatar_url?: string };
  if (!result?.file_url && !result?.avatar_url) {
    throw new Error('Respuesta inválida al subir la foto');
  }
  return {
    file_url: result.file_url ?? result.avatar_url ?? '',
    avatar_url: result.avatar_url ?? result.file_url ?? '',
  };
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
}): Promise<DirectionsResult> {
  const { data } = await api.get<DirectionsResult & { data?: DirectionsResult }>(
    '/maps/directions',
    { params },
  );
  const body = data?.polyline != null ? data : data?.data;
  if (!body || typeof body.polyline !== 'string') {
    throw new Error('Respuesta inválida de directions');
  }
  return {
    distance_km: Number(body.distance_km),
    duration_minutes: Number(body.duration_minutes),
    polyline: body.polyline,
  };
}

export async function geocodeAddress(
  address: string,
  bias?: { lat?: number; lng?: number },
): Promise<{
  lat: number;
  lng: number;
  formatted_address: string;
}> {
  const params: { address: string; bias_lat?: number; bias_lng?: number } = { address };
  if (typeof bias?.lat === 'number' && Number.isFinite(bias.lat)) params.bias_lat = bias.lat;
  if (typeof bias?.lng === 'number' && Number.isFinite(bias.lng)) params.bias_lng = bias.lng;
  const { data } = await api.get<{ lat: number; lng: number; formatted_address: string }>(
    '/maps/geocode',
    { params },
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

/** Axios cancel, fetch AbortError, DOMException, or already-aborted signal. */
export function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err == null || typeof err !== 'object') return false;
  const e = err as {
    name?: string;
    code?: string | number;
    message?: string;
    __CANCEL__?: boolean;
  };
  if (e.__CANCEL__ === true) return true;
  if (e.name === 'CanceledError' || e.name === 'AbortError' || e.name === 'TimeoutError') {
    return true;
  }
  if (e.code === 'ERR_CANCELED' || e.code === 'ABORT_ERR' || e.code === 20) return true;
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  if (msg.includes('aborted') || msg === 'canceled' || msg === 'cancelled') return true;
  return false;
}

export async function searchPlaces(
  input: string,
  lat?: number,
  lng?: number,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  try {
    const { data } = await api.get<PlaceSuggestion[]>('/maps/places/autocomplete', {
      params: { input: q, lat, lng },
      timeout: 5000,
      signal,
    });
    const list = Array.isArray(data) ? data : [];
    if (list.length > 0) return list;
  } catch (err) {
    if (isAbortError(err, signal)) throw err;
    // 401 / network / timeout — fall through to Photon
  }

  if (signal?.aborted) {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  try {
    return await searchPhotonPlaces(q, lat, lng, signal);
  } catch (err) {
    if (isAbortError(err, signal)) throw err;
    // Photon soft-fail path should return []; any unexpected throw → empty, not sticky error.
    return [];
  }
}
