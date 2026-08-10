import { create } from 'zustand';

interface LocationCoord {
  lat: number;
  lng: number;
}

interface LocationStore {
  current: LocationCoord | null;
  permissionGranted: boolean;
  setCurrent: (current: LocationCoord | null) => void;
  setPermissionGranted: (granted: boolean) => void;
}

export const useLocationStore = create<LocationStore>((set) => ({
  current: null,
  permissionGranted: false,
  setCurrent: (current) => set({ current }),
  setPermissionGranted: (permissionGranted) => set({ permissionGranted }),
}));
