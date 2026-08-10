import { create } from 'zustand';
import type { Trip, TripStatus } from '../api/types';

interface PlaceCoord {
  lat: number;
  lng: number;
  address: string;
}

interface RideStore {
  activeTrip: Trip | null;
  status: TripStatus | null;
  pickup: PlaceCoord | null;
  destination: PlaceCoord | null;
  setActiveTrip: (trip: Trip | null) => void;
  setStatus: (status: TripStatus | null) => void;
  setPickup: (pickup: PlaceCoord | null) => void;
  setDestination: (destination: PlaceCoord | null) => void;
  reset: () => void;
}

export const useRideStore = create<RideStore>((set) => ({
  activeTrip: null,
  status: null,
  pickup: null,
  destination: null,
  setActiveTrip: (activeTrip) => set({ activeTrip }),
  setStatus: (status) => set({ status }),
  setPickup: (pickup) => set({ pickup }),
  setDestination: (destination) => set({ destination }),
  reset: () => set({ activeTrip: null, status: null, pickup: null, destination: null }),
}));
