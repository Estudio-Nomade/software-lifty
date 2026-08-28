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
  /** User-facing recovery message when GPS fails or is denied. */
  locationError: string | null;
  setCurrent: (current: LocationCoord | null) => void;
  /**
   * Accept a fix only when it improves (or matches) known accuracy,
   * unless `force` is true. Prevents coarse IP/WiFi from overwriting GPS.
   * First valid fix is always accepted.
   */
  applyFix: (fix: LocationCoord, opts?: { force?: boolean }) => boolean;
  setPermissionGranted: (granted: boolean) => void;
  setLocationError: (message: string | null) => void;
}

export const useLocationStore = create<LocationStore>((set, get) => ({
  current: null,
  permissionGranted: false,
  locationError: null,
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
    // Coarse network fixes (often 500m–5km) must not overwrite GPS.
    if (!opts?.force && prev && nextAcc > prevAcc + 15) {
      return false;
    }
    // Same-or-worse accuracy with tiny movement: ignore noise.
    if (
      !opts?.force &&
      prev &&
      nextAcc >= prevAcc - 5 &&
      Math.abs(prev.lat - lat) < 1e-6 &&
      Math.abs(prev.lng - lng) < 1e-6
    ) {
      return false;
    }

    set({
      current: { lat, lng, accuracy: nextAcc },
      permissionGranted: true,
      locationError: null,
    });
    return true;
  },
  setPermissionGranted: (permissionGranted) => set({ permissionGranted }),
  setLocationError: (locationError) => set({ locationError }),
}));
