import { create } from 'zustand';

interface LocationState {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  /** Horizontal accuracy in meters from the last applied fix; null if unknown. */
  accuracy: number | null;
  locationError: string | null;
  setLocation: (
    lat: number,
    lng: number,
    heading?: number | null,
    accuracy?: number | null,
  ) => void;
  setLocationError: (message: string | null) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()((set) => ({
  lat: null,
  lng: null,
  heading: null,
  accuracy: null,
  locationError: null,
  setLocation: (lat, lng, heading = null, accuracy = null) =>
    set({ lat, lng, heading, accuracy, locationError: null }),
  setLocationError: (locationError) => set({ locationError }),
  clearLocation: () =>
    set({ lat: null, lng: null, heading: null, accuracy: null, locationError: null }),
}));
