import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { decodePolyline } from '../lib/polyline';
import { useLocationStore } from '../store/locationStore';
import type { ManeuverStep } from './useManeuverInstructions';

export type { ManeuverStep };

interface DirectionsData {
  duration_minutes: number;
  distance_km: number;
  polyline: string;
  steps: ManeuverStep[];
  alternatives: Array<{
    duration_minutes: number;
    distance_km: number;
    polyline: string;
    steps: ManeuverStep[];
  }>;
}

interface RoutingResult {
  routeCoords: [number, number][];
  etaMinutes: number | null;
  distKm: number | null;
  steps: ManeuverStep[];
  altRouteCoords: [number, number][];
  altEtaMinutes: number | null;
  altDistKm: number | null;
  altSteps: ManeuverStep[];
}

const THROTTLE_MS = 10000;

export function useDynamicRouting(destLat: number | null, destLng: number | null): RoutingResult {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distKm, setDistKm] = useState<number | null>(null);
  const [steps, setSteps] = useState<ManeuverStep[]>([]);
  const [altRouteCoords, setAltRouteCoords] = useState<[number, number][]>([]);
  const [altEtaMinutes, setAltEtaMinutes] = useState<number | null>(null);
  const [altDistKm, setAltDistKm] = useState<number | null>(null);
  const [altSteps, setAltSteps] = useState<ManeuverStep[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const lat = useLocationStore.getState().lat;
      const lng = useLocationStore.getState().lng;

      if (lat == null || lng == null || destLat == null || destLng == null) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const id = ++fetchIdRef.current;

      try {
        const res = await apiClient.get('/maps/directions', {
          params: {
            origin_lat: lat,
            origin_lng: lng,
            dest_lat: destLat,
            dest_lng: destLng,
          },
          signal: controller.signal,
        });

        if (cancelled || id !== fetchIdRef.current) return;

        const data = (res.data?.data ?? res.data) as DirectionsData;

        setEtaMinutes(data.duration_minutes);
        setDistKm(data.distance_km);
        setRouteCoords(decodePolyline(data.polyline));
        setSteps(data.steps ?? []);

        if (data.alternatives?.length) {
          const alt = data.alternatives[0];
          setAltRouteCoords(decodePolyline(alt.polyline));
          setAltEtaMinutes(alt.duration_minutes);
          setAltDistKm(alt.distance_km);
          setAltSteps(alt.steps ?? []);
        } else {
          setAltRouteCoords([]);
          setAltEtaMinutes(null);
          setAltDistKm(null);
          setAltSteps([]);
        }
      } catch (err: any) {
        if (err?.code === 'ERR_CANCELED' || cancelled) return;
        if (__DEV__) console.warn('[useDynamicRouting] fetch failed:', err?.message ?? err);
      }
    };

    tick();

    const interval = setInterval(tick, THROTTLE_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [destLat, destLng]);

  return {
    routeCoords,
    etaMinutes,
    distKm,
    steps,
    altRouteCoords,
    altEtaMinutes,
    altDistKm,
    altSteps,
  };
}
