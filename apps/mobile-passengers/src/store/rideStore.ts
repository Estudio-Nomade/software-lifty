import { create } from 'zustand';
import type { Trip, TripStatus } from '../api/types';

interface PlaceCoord {
  lat: number;
  lng: number;
  address: string;
}

interface DriverLocation {
  lat: number;
  lng: number;
  heading?: number | null;
}

interface RideStore {
  activeTrip: Trip | null;
  status: TripStatus | null;
  pickup: PlaceCoord | null;
  destination: PlaceCoord | null;
  driverLocation: DriverLocation | null;
  setActiveTrip: (trip: Trip | null) => void;
  setStatus: (status: TripStatus | null) => void;
  setPickup: (pickup: PlaceCoord | null) => void;
  setDestination: (destination: PlaceCoord | null) => void;
  setDriverLocation: (location: DriverLocation | null) => void;
  reset: () => void;
}

export const useRideStore = create<RideStore>((set) => ({
  activeTrip: null,
  status: null,
  pickup: null,
  destination: null,
  driverLocation: null,
  setActiveTrip: (activeTrip) => set({ activeTrip }),
  setStatus: (status) => set({ status }),
  setPickup: (pickup) => set({ pickup }),
  setDestination: (destination) => set({ destination }),
  setDriverLocation: (driverLocation) => set({ driverLocation }),
  reset: () =>
    set({
      activeTrip: null,
      status: null,
      pickup: null,
      destination: null,
      driverLocation: null,
    }),
}));
