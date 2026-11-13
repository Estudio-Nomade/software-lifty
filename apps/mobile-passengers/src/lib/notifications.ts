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
    // Channels first: they do not need the runtime permission, and the user can grant
    // it later from system Settings without the channel (and its importance) missing.
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

    const perm = (await Notifications.requestPermissionsAsync()) as unknown as PermStatus;
    if (perm.status !== 'granted') {
      if (__DEV__) {
        console.warn('[push] permission not granted', perm.status);
      }
      return null;
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

const DEFAULT_RETRY_DELAYS_MS = [2000, 8000];
/** Last time the backend confirmed our token (0 = never / last attempt failed). */
let lastRegisteredAt = 0;
/** Last time we started a registration attempt (success or fail). */
let lastAttemptAt = 0;
/** Single-flight: concurrent AppState/token listeners share one in-flight run. */
let inFlightRegistration: Promise<string | null> | null = null;

/**
 * After a full failure, do not re-POST on every AppState 'active' (location permission
 * dialogs flip active repeatedly and used to spam 15s axios timeouts forever).
 */
export const PUSH_FAILURE_COOLDOWN_MS = 60_000;

export function resetPushRegistrationStateForTests(): void {
  registeredPushToken = null;
  lastRegisteredAt = 0;
  lastAttemptAt = 0;
  inFlightRegistration = null;
}

type RegistrationOptions = {
  retryDelaysMs?: number[];
  /** Bypass failure cooldown (e.g. OS rotated the device push token). */
  force?: boolean;
  failureCooldownMs?: number;
};

/**
 * Permission → Expo token → POST /notifications/token tagged as the passenger app.
 * A failed POST is retried (default 2s, 8s) instead of being lost until the next launch.
 * Concurrent callers await the same in-flight promise; after total failure a cooldown
 * blocks automatic retries so Complete Profile GPS is not starved by push spam.
 */
export async function ensurePushRegistration(
  options: RegistrationOptions = {},
): Promise<string | null> {
  if (inFlightRegistration) return inFlightRegistration;

  const force = options.force === true;
  const cooldownMs = options.failureCooldownMs ?? PUSH_FAILURE_COOLDOWN_MS;
  if (!force && !lastRegisteredAt && lastAttemptAt > 0) {
    const since = Date.now() - lastAttemptAt;
    if (since < cooldownMs) {
      return registeredPushToken;
    }
  }

  inFlightRegistration = (async () => {
    lastAttemptAt = Date.now();
    try {
      const token = await registerForPush();
      if (!token) return null;
      const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

      for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
          await api.post('/notifications/token', {
            token,
            platform: Platform.OS,
            // Backend scopes tokens per app so passenger pushes never reach the driver app.
            app: 'passenger',
          });
          registeredPushToken = token;
          lastRegisteredAt = Date.now();
          return token;
        } catch (err) {
          if (__DEV__) {
            console.warn('[push] POST /notifications/token failed', err);
          }
          if (attempt < delays.length) {
            await new Promise<void>((resolve) => setTimeout(resolve, delays[attempt]));
          }
        }
      }
      lastRegisteredAt = 0;
      return token;
    } finally {
      inFlightRegistration = null;
    }
  })();

  return inFlightRegistration;
}

/** Foreground hook: re-register only if the last successful registration is old/failed. */
export async function ensurePushRegistrationIfStale(
  maxAgeMs = 30 * 60_000,
  options: RegistrationOptions = {},
): Promise<void> {
  if (lastRegisteredAt && Date.now() - lastRegisteredAt < maxAgeMs) return;
  // Failure cooldown lives inside ensurePushRegistration (unless force).
  await ensurePushRegistration(options);
}

/** Device push token rotated (reinstall/restore/OS) → caller should re-register. */
export async function addPushTokenListener(
  listener: (token: unknown) => void,
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  try {
    return Notifications.addPushTokenListener(listener as never);
  } catch {
    return null;
  }
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
    case 'trip:verification':
    case 'trip:completed':
      navigate('TripInProgress');
      break;
    case 'debt:warning':
    case 'cancel_rate:warning':
      navigate('Profile');
      break;
    case 'trip:cancelled':
      navigate('Home');
      break;
    default:
      break;
  }
}
