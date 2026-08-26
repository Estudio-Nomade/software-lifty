import { create } from 'zustand';

interface LocationCoord {
  lat: number;
  lng: number;
  /** meters; lower is better. Infinity when unknown. */
  accuracy?: number;
}

interface LocationStore {
  current: LocationCoord | null;
  permissionGranted: boolean;
  setCurrent: (current: LocationCoord | null) => void;
  /**
   * Accept a fix only when it improves (or matches) known accuracy,
   * unless `force` is true. Prevents coarse IP/WiFi from overwriting GPS.
   */
  applyFix: (fix: LocationCoord, opts?: { force?: boolean }) => boolean;
  setPermissionGranted: (granted: boolean) => void;
}

export const useLocationStore = create<LocationStore>((set, get) => ({
  current: null,
  permissionGranted: false,
  setCurrent: (current) => set({ current }),
  applyFix: (fix, opts) => {
    const lat = fix.lat;
    const lng = fix.lng;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      (lat === 0 && lng === 0)
    ) {
      return false;
    }

    const nextAcc =
      typeof fix.accuracy === 'number' && Number.isFinite(fix.accuracy)
        ? fix.accuracy
        : Number.POSITIVE_INFINITY;
    const prev = get().current;
    const prevAcc =
      prev && typeof prev.accuracy === 'number' && Number.isFinite(prev.accuracy)
        ? prev.accuracy
        : Number.POSITIVE_INFINITY;

    // Keep a better fix unless forced or we have nothing yet.
    if (!opts?.force && prev && nextAcc > prevAcc + 25) {
      return false;
    }

    set({
      current: { lat, lng, accuracy: nextAcc },
      permissionGranted: true,
    });
    return true;
  },
  setPermissionGranted: (permissionGranted) => set({ permissionGranted }),
}));
