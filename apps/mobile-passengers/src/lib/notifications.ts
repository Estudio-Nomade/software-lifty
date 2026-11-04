import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '../api/client';

interface PermStatus {
  status: string;
  granted: boolean;
}

/** Minimal shape for notification tap payloads — avoids static expo-notifications import. */
export type NotificationResponseLike = {
  notification: {
    request: {
      content: {
        data?: Record<string, string | undefined>;
      };
    };
  };
};

/**
 * SDK 53+: Android remote push was removed from Expo Go and throws on import/use.
 * Importing expo-notifications there can break root layout evaluation (stuck splash).
 */
export function isRemotePushAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android' && isRunningInExpoGo()) return false;
  return true;
}

async function loadNotifications(): Promise<typeof import('expo-notifications') | null> {
  if (!isRemotePushAvailable()) return null;
  try {
    // Lazy require (same as the driver app): keeps load deferred and lets Jest mock it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
}

export async function setupNotificationHandler(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function addNotificationResponseListener(
  listener: (response: NotificationResponseLike) => void,
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  try {
    // Listener only reads content.data; cast avoids coupling to full NotificationResponse.
    return Notifications.addNotificationResponseReceivedListener(
      listener as Parameters<typeof Notifications.addNotificationResponseReceivedListener>[0],
    );
  } catch {
    return null;
  }
}

export async function registerForPush(): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.slug;

  if (!projectId) {
    return null;
  }

  try {
    const perm = (await Notifications.requestPermissionsAsync()) as unknown as PermStatus;
    if (perm.status !== 'granted') {
      if (__DEV__) {
        console.warn('[push] permission not granted', perm.status);
      }
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('trip-chat', {
        name: 'Chat del viaje',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
      await Notifications.setNotificationChannelAsync('trip-requests', {
        name: 'Viajes',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (err) {
    if (__DEV__) {
      console.warn('[push] registerForPush failed', err);
    }
    return null;
  }
}

/** Token this install last registered; needed to unregister on logout. */
let registeredPushToken: string | null = null;

/** Permission → Expo token → POST /notifications/token tagged as the passenger app. */
export async function ensurePushRegistration(): Promise<string | null> {
  const token = await registerForPush();
  if (!token) return null;
  try {
    await api.post('/notifications/token', {
      token,
      platform: Platform.OS,
      // Backend scopes tokens per app so passenger pushes never reach the driver app.
      app: 'passenger',
    });
    registeredPushToken = token;
  } catch (err) {
    if (__DEV__) {
      console.warn('[push] POST /notifications/token failed', err);
    }
  }
  return token;
}

/** Best-effort: drop this device's token while the session is still valid (before sign-out). */
export async function unregisterPush(): Promise<void> {
  const token = registeredPushToken;
  if (!token) return;
  try {
    await api.delete('/notifications/token', { params: { token } });
    registeredPushToken = null;
  } catch (err) {
    if (__DEV__) {
      console.warn('[push] DELETE /notifications/token failed', err);
    }
  }
}

export function handleNotificationResponse(
  response: NotificationResponseLike,
  navigate: (screen: string, params?: Record<string, string>) => void,
): void {
  const data = response.notification.request.content.data as
    | Record<string, string | undefined>
    | undefined;
  const type = data?.type;

  switch (type) {
    case 'trip:message': {
      const params = data?.trip_id ? { tripId: data.trip_id } : undefined;
      navigate('Chat', params);
      break;
    }
    case 'trip:status':
    case 'trip:accepted':
    case 'trip:arrived':
    case 'trip:completed':
      navigate('TripInProgress');
      break;
    case 'trip:cancelled':
      navigate('Home');
      break;
    default:
      break;
  }
}
