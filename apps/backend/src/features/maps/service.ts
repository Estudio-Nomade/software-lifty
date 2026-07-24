import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverLocations, drivers } from '../../shared/db/schema';
import {
  type DirectionsResult,
  type DistanceMatrixResult,
  type GeocodeResult,
  type PlaceResult,
  autocomplete as geoAutocomplete,
  directions as geoDirections,
  distanceMatrix as geoDistanceMatrix,
  geocode as geoGeocode,
} from '../../shared/lib/geo';
import { type FareResult, calculateFare } from '../../shared/lib/pricing';
import { type HeatmapBounds, type HeatmapPoint, computeHeatmap } from './heatmap-service';

export interface FareEstimateResult extends FareResult {
  distance_km: number;
  duration_minutes: number;
}

export const mapsService = {
  async autocomplete(input: string): Promise<PlaceResult[]> {
    return geoAutocomplete(input);
  },

  async geocode(params: { lat?: number; lng?: number; address?: string }): Promise<GeocodeResult> {
    return geoGeocode(params);
  },

  async directions(
    origin_lat: number,
    origin_lng: number,
    dest_lat: number,
    dest_lng: number,
  ): Promise<DirectionsResult> {
    return geoDirections(origin_lat, origin_lng, dest_lat, dest_lng);
  },

  async fareEstimate(
    origin_lat: number,
    origin_lng: number,
    dest_lat: number,
    dest_lng: number,
    vehicle_type: string,
  ): Promise<FareEstimateResult> {
    const matrix: DistanceMatrixResult = await geoDistanceMatrix(
      origin_lat,
      origin_lng,
      dest_lat,
      dest_lng,
    );

    const fare = calculateFare({
      vehicle_type,
      distance_km: matrix.distance_km,
      duration_minutes: matrix.duration_minutes,
    });

    return {
      distance_km: matrix.distance_km,
      duration_minutes: matrix.duration_minutes,
      ...fare,
    };
  },

  async getHeatmap(
    sw_lat: number,
    sw_lng: number,
    ne_lat: number,
    ne_lng: number,
    gridSize = 5,
  ): Promise<{
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: { type: 'Point'; coordinates: [number, number] };
      properties: { weight: number };
    }>;
  }> {
    const bounds: HeatmapBounds = { sw_lat, sw_lng, ne_lat, ne_lng };

    const rows = await db
      .select({ lat: driverLocations.lat, lng: driverLocations.lng })
      .from(driverLocations)
      .innerJoin(drivers, eq(drivers.id, driverLocations.driver_id))
      .where(
        and(
          eq(drivers.is_online, true),
          sql`${driverLocations.lat} >= ${sw_lat}`,
          sql`${driverLocations.lat} <= ${ne_lat}`,
          sql`${driverLocations.lng} >= ${sw_lng}`,
          sql`${driverLocations.lng} <= ${ne_lng}`,
        ),
      );

    const points = computeHeatmap(bounds, gridSize, rows);

    return {
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p.coordinate },
        properties: { weight: p.weight },
      })),
    };
  },
};
