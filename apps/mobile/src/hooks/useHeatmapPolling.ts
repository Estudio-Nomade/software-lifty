import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { useLocationStore } from '../store/locationStore';

interface HeatmapPoint {
  coordinate: [number, number];
  weight: number;
}

export function useHeatmapPolling() {
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const lat = useLocationStore((s) => s.lat);
  const lng = useLocationStore((s) => s.lng);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchHeatmap = async () => {
      if (lat == null || lng == null) return;
      try {
        const res = await apiClient.get('/maps/heatmap', {
          params: {
            sw_lat: lat - 0.05,
            sw_lng: lng - 0.05,
            ne_lat: lat + 0.05,
            ne_lng: lng + 0.05,
          },
        });
        const features = res.data?.features ?? res.data?.data?.features ?? [];
        setHeatmapPoints(
          features.map((f: any) => ({
            coordinate: f.geometry.coordinates as [number, number],
            weight: f.properties.weight as number,
          })),
        );
      } catch {
        // keep previous heatmap data on error
      }
    };

    fetchHeatmap();
    intervalRef.current = setInterval(fetchHeatmap, 45_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [lat, lng]);

  return heatmapPoints;
}
