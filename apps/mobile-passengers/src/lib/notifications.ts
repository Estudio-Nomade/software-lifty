import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

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
    return await import('expo-notifications');
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
  } catch {
    return null;
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
    case 'trip:message':
      navigate('Chat');
      break;
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
