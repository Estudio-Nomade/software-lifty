import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

interface PermStatus {
  status: string;
  granted: boolean;
}

export function setupNotificationHandler(): void {
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

export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

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
  response: Notifications.NotificationResponse,
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
