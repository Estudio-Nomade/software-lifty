import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { useAuthStore } from '../store/authStore';
import { buildTripCancelledParams } from './cancellation';
import { resolvePostAuthRoute, routeForDriverStatus } from './postAuthRouting';

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
      await Notifications.setNotificationChannelAsync('account', {
        name: 'Cuenta y documentos',
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

/**
 * Refetch driver status, apply store, navigate for approve/reject push taps.
 * Fire-and-forget friendly: navigate optimistically then correct from API.
 */
export async function reactToDriverReviewPush(
  type: string,
  navigate: (screen: string, params?: Record<string, string>) => void,
  pushReason?: string,
): Promise<void> {
  const isApproved = type === 'driver:approved' || type === 'kyc:approved';
  const isRejected = type === 'driver:rejected' || type === 'kyc:rejected';
  if (!isApproved && !isRejected) return;

  // Optimistic route so tap feels instant; API refresh corrects store.
  if (isApproved) {
    useAuthStore.getState().setDriverStatus('approved');
    useAuthStore.getState().setOnboardingStep('approved');
    navigate('Active');
  } else {
    useAuthStore.getState().setDriverStatus('rejected');
    useAuthStore.getState().setOnboardingStep('documents');
    navigate('OnboardingStep2', pushReason ? { reviewReason: pushReason } : undefined);
  }

  try {
    const route = await resolvePostAuthRoute();
    if (route.screen && route.screen !== (isApproved ? 'Active' : 'OnboardingStep2')) {
      navigate(route.screen);
    }
  } catch {
    try {
      const { data: body } = await apiClient.get('/drivers/me/status');
      const payload = body?.data ?? body;
      const parsed = driverStatusSchema.safeParse(payload);
      const driverData = parsed.success ? parsed.data : (payload as DriverStatus);
      if (driverData.status) {
        useAuthStore.getState().setDriverStatus(driverData.status);
      }
      if (driverData.step != null) {
        useAuthStore.getState().setOnboardingStep(driverData.step);
      }
      const r = routeForDriverStatus(driverData);
      if (r.screen) navigate(r.screen);
    } catch {
      // keep optimistic navigation
    }
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
    case 'driver:approved':
    case 'kyc:approved':
      void reactToDriverReviewPush(type, navigate);
      break;
    case 'identification:issued':
      navigate('Active');
      break;
    case 'driver:rejected':
    case 'kyc:rejected':
      void reactToDriverReviewPush(type, navigate, data?.reason);
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
