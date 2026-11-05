import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const KEY = 'lifty-passenger-location-prompt-seen-v1';

export async function markLocationPromptSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // best-effort
  }
}

export async function clearLocationPromptSeen(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

/**
 * First-time location screen after complete profile.
 * Skip if already shown, or OS already has a decision (granted/denied).
 */
export async function needsLocationPermissionPrompt(): Promise<boolean> {
  try {
    const seen = await AsyncStorage.getItem(KEY);
    if (seen === '1') return false;
  } catch {
    // continue
  }

  if (Platform.OS === 'web') {
    return true;
  }

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'undetermined') return true;
    await markLocationPromptSeen();
    return false;
  } catch {
    return true;
  }
}
