import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import {
  autocompleteQuery,
  directionsQuery,
  fareEstimateBody,
  geocodeQuery,
  heatmapQuery,
} from './schema';
import { mapsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const mapsRoutes = new Elysia({ prefix: '/maps' })
  .use(authGuard)
  .get(
    '/places/autocomplete',
    ({ query, set }) => safeCall(() => mapsService.autocomplete(query.input), set),
    { query: autocompleteQuery, requireAuth: true },
  )
  .get(
    '/geocode',
    ({ query, set }) =>
      safeCall(
        () => mapsService.geocode({ lat: query.lat, lng: query.lng, address: query.address }),
        set,
      ),
    { query: geocodeQuery, requireAuth: true },
  )
  .get(
    '/directions',
    ({ query, set }) =>
      safeCall(
        () =>
          mapsService.directions(
            query.origin_lat,
            query.origin_lng,
            query.dest_lat,
            query.dest_lng,
          ),
        set,
      ),
    { query: directionsQuery, requireAuth: true },
  )
  .post(
    '/fare-estimate',
    ({ body, set }) =>
      safeCall(
        () =>
          mapsService.fareEstimate(
            body.origin_lat,
            body.origin_lng,
            body.dest_lat,
            body.dest_lng,
            body.vehicle_type,
          ),
        set,
      ),
    { body: fareEstimateBody, requireAuth: true },
  )
  .get(
    '/heatmap',
    ({ query, set }) =>
      safeCall(
        () =>
          mapsService.getHeatmap(
            query.sw_lat,
            query.sw_lng,
            query.ne_lat,
            query.ne_lng,
            query.grid_size,
          ),
        set,
      ),
    { query: heatmapQuery, requireAuth: true },
  );
