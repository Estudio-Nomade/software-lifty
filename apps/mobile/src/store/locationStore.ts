import { create } from 'zustand';

interface LocationState {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  /** Horizontal accuracy in meters from the last applied fix; null if unknown. */
  accuracy: number | null;
  /** Ground speed in m/s from the last fix; null if unknown. */
  speed: number | null;
  /** Device timestamp (ms epoch) of the last fix; null if unknown. */
  fixAt: number | null;
  locationError: string | null;
  setLocation: (
    lat: number,
    lng: number,
    heading?: number | null,
    accuracy?: number | null,
    speed?: number | null,
    fixAt?: number | null,
  ) => void;
  setLocationError: (message: string | null) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()((set) => ({
  lat: null,
  lng: null,
  heading: null,
  accuracy: null,
  speed: null,
  fixAt: null,
  locationError: null,
  setLocation: (lat, lng, heading = null, accuracy = null, speed = null, fixAt = null) =>
    set({ lat, lng, heading, accuracy, speed, fixAt, locationError: null }),
  setLocationError: (locationError) => set({ locationError }),
  clearLocation: () =>
    set({
      lat: null,
      lng: null,
      heading: null,
      accuracy: null,
      speed: null,
      fixAt: null,
      locationError: null,
    }),
}));
