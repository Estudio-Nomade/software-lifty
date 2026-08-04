import * as Location from 'expo-location';
import { useLocationStore } from '../store/locationStore';

const LOCATION_TASK = 'lifty-location';

let subscription: Location.LocationSubscription | null = null;

export async function startTracking(): Promise<void> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return;

    subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
      },
      (loc) => {
        useLocationStore
          .getState()
          .setLocation(loc.coords.latitude, loc.coords.longitude, loc.coords.heading);
      },
    );
  } catch (error) {
    console.error('startTracking failed:', error);
  }
}

export async function stopTracking(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch (error) {
    console.error('stopTracking failed:', error);
  } finally {
    subscription?.remove();
    subscription = null;
  }
}

export async function getCurrentPosition(): Promise<void> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    useLocationStore
      .getState()
      .setLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading);
  } catch (error) {
    console.error('getCurrentPosition failed:', error);
  }
}

export async function hasPermissions(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('hasPermissions failed:', error);
    return false;
  }
}

export async function requestPermissions(): Promise<boolean> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted;
  } catch (error) {
    console.error('requestPermissions failed:', error);
    return false;
  }
}
