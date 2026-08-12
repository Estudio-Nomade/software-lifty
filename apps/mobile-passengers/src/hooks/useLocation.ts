import * as Location from 'expo-location';
import { useEffect } from 'react';
import { useLocationStore } from '../store/locationStore';

export function useLocation() {
  const current = useLocationStore((s) => s.current);
  const setCurrent = useLocationStore((s) => s.setCurrent);
  const permissionGranted = useLocationStore((s) => s.permissionGranted);
  const setPermissionGranted = useLocationStore((s) => s.setPermissionGranted);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      const granted = status === 'granted';
      setPermissionGranted(granted);
      if (!granted) return;

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000 },
        (loc) => {
          if (!cancelled) {
            setCurrent({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        },
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [setCurrent, setPermissionGranted]);

  return { current, permissionGranted };
}
