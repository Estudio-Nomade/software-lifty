import type * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { apiClient } from '../api/client';
import { LOCATION_TASK_NAME, applyLocationCoords } from './locationCore';

/**
 * Must be evaluated at module load (root import) so the native task is registered
 * before any startLocationUpdatesAsync call — including after process wake.
 */
if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('[bg-location] task error:', error.message);
      return;
    }

    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations?.length) return;

    const latest = locations[locations.length - 1];
    const { latitude, longitude, heading } = latest.coords;
    if (!applyLocationCoords(latitude, longitude, heading)) return;

    try {
      await apiClient.put('/drivers/me/heartbeat', {
        lat: latitude,
        lng: longitude,
        heading: heading ?? null,
      });
    } catch {
      // Best-effort: OS may fire updates without network; next tick retries.
    }
  });
}
