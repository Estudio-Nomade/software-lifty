import { create } from 'zustand';

interface LocationState {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  locationError: string | null;
  setLocation: (lat: number, lng: number, heading?: number | null) => void;
  setLocationError: (message: string | null) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()((set) => ({
  lat: null,
  lng: null,
  heading: null,
  locationError: null,
  setLocation: (lat, lng, heading = null) => set({ lat, lng, heading, locationError: null }),
  setLocationError: (locationError) => set({ locationError }),
  clearLocation: () => set({ lat: null, lng: null, heading: null, locationError: null }),
}));
