import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { decodePolyline } from '../lib/polyline';

const THROTTLE_MS = 10_000;

/**
 * Computes the driving route polyline from the driver's current position to a
 * target (pickup during `accepted`/`en_route`, destination during `in_trip`).
 * Reuses the backend `/maps/directions` endpoint.
 */
export function useDriverRoute(
  driverLat: number | null,
  driverLng: number | null,
  destLat: number | null,
  destLng: number | null,
): [number, number][] {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (driverLat == null || driverLng == null || destLat == null || destLng == null) {
        setRouteCoords([]);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data } = await api.get('/maps/directions', {
          params: {
            origin_lat: driverLat,
            origin_lng: driverLng,
            dest_lat: destLat,
            dest_lng: destLng,
          },
          signal: controller.signal,
        });

        if (cancelled) return;

        const polyline = data?.polyline ?? data?.data?.polyline;
        setRouteCoords(polyline ? decodePolyline(polyline) : []);
      } catch (err: any) {
        if (err?.code === 'ERR_CANCELED' || cancelled) return;
      }
    };

    tick();

    const interval = setInterval(tick, THROTTLE_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [driverLat, driverLng, destLat, destLng]);

  return routeCoords;
}
