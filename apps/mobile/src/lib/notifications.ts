import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { buildTripCancelledParams } from './cancellation';

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
      // Backend Expo pushes use channelId "trip-requests" by default.
      await Notifications.setNotificationChannelAsync('trip-requests', {
        name: 'Trip Requests',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
      await Notifications.setNotificationChannelAsync('trip-chat', {
        name: 'Chat del viaje',
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
    case 'trip:request':
      navigate('IncomingRequest');
      break;
    case 'trip:cancelled':
      navigate(
        'TripCancelled',
        buildTripCancelledParams({
          id: data?.trip_id,
          cancel_reason: data?.cancel_reason,
          cancel_actor: data?.cancel_actor,
          counts_for_tvf: data?.counts_for_tvf,
          credit_driver: data?.credit_driver,
          fee_applied: data?.fee_applied,
        }),
      );
      break;
    case 'tvf:warning':
      navigate('Profile');
      break;
    case 'kyc:approved':
      navigate('Active');
      break;
    case 'kyc:rejected':
      navigate('WaitingApproval');
      break;
    case 'payment:deposited':
      navigate('Earnings');
      break;
    case 'trip:message': {
      // Chat reads the active trip from the store (restored by ActiveTripRecovery).
      // Pass trip_id so deep-links stay explicit if the route ever needs it.
      const params = data?.trip_id ? { tripId: data.trip_id } : undefined;
      navigate('Chat', params);
      break;
    }
    case 'trip:rated':
      navigate('Active');
      break;
    default:
      break;
  }
}
