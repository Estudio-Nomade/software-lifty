export interface PassengerProfile {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  avatar_url?: string;
}

export type TripStatus =
  | 'idle'
  | 'requested'
  | 'driver_assigned'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'in_trip'
  | 'completed'
  | 'cancelled';

export interface Trip {
  id: string;
  passenger_id: string;
  driver_id?: string;
  status: TripStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  destination_lat: number;
  destination_lng: number;
  destination_address: string;
  estimate_fare?: number;
  final_fare?: number;
  total_fare?: number;
  vehicle_type?: 'auto' | 'moto';
  payment_method?: 'cash' | 'mercadopago';
  verification_code?: string;
  driver_name?: string;
  driver_avatar_url?: string;
  driver_rating?: number;
  vehicle_brand?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_plate?: string;
  created_at: string;
  updated_at: string;
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
}

export interface ApiError {
  error: string;
  message?: string;
}
