export interface PassengerProfile {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  avatar_url?: string;
}

export type TripStatus =
  | 'pending'
  | 'offered'
  | 'request_received'
  | 'accepted'
  | 'en_route'
  | 'waiting'
  | 'in_trip'
  | 'completed'
  | 'cancelled'
  | 'cancelled_early'
  | 'cancelled_late'
  | 'rejected'
  | 'expired'
  | 'rated';

export interface Trip {
  id: string;
  passenger_id: string;
  driver_id?: string | null;
  status: TripStatus;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  origin_address?: string | null;
  dest_address?: string | null;
  distance_km?: number | null;
  duration_minutes?: number | null;
  total_fare?: number | null;
  platform_fee?: number | null;
  payment_method?: 'cash' | 'transfer' | string | null;
  verification_code?: string | null;
  driver_name?: string | null;
  driver_avatar_url?: string | null;
  driver_rating?: number | null;
  driver_phone?: string | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  vehicle_plate?: string | null;
  driver_lat?: number | null;
  driver_lng?: number | null;
  created_at: string;
  updated_at: string;
}

export interface TripMessage {
  id: string;
  trip_id: string;
  sender_id: string;
  sender_role: 'driver' | 'passenger';
  text: string;
  created_at: string;
}

export interface FareEstimate {
  fare: number;
  distance_km: number;
  duration_min: number;
  vehicle_type: 'auto' | 'moto';
}

export interface PlaceSuggestion {
  place_id: string;
  description: string;
  lat: number;
  lng: number;
}

export interface ApiError {
  error: string;
  message?: string;
}
