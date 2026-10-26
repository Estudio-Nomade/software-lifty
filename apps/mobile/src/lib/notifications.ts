import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
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

export async function getLastNotificationResponse(): Promise<NotificationResponseLike | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return (response as NotificationResponseLike | null) ?? null;
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
  messageId?: string,
): Promise<void> {
  const isApproved = type === 'driver:approved' || type === 'kyc:approved';
  const isRejected = type === 'driver:rejected' || type === 'kyc:rejected';
  const isReviewNotes = type === 'driver:review_notes';
  if (!isApproved && !isRejected && !isReviewNotes) return;

  // Optimistic route so tap feels instant; API refresh corrects store.
  if (isApproved) {
    useAuthStore.getState().setDriverStatus('approved');
    useAuthStore.getState().setOnboardingStep('approved');
    navigate('Active');
  } else if (isReviewNotes) {
    useAuthStore.getState().setDriverStatus('under_review');
    useAuthStore.getState().setOnboardingStep('documents');
    const inboxParams: Record<string, string> = {};
    if (messageId) inboxParams.messageId = messageId;
    if (pushReason) inboxParams.reviewReason = pushReason;
    // Mark-as-read happens in MessagesInboxScreen on focus (messageId param).
    navigate('Messages', Object.keys(inboxParams).length ? inboxParams : undefined);
  } else {
    useAuthStore.getState().setDriverStatus('rejected');
    useAuthStore.getState().setOnboardingStep('documents');
    navigate('OnboardingStep2', pushReason ? { reviewReason: pushReason } : undefined);
  }

  if (isReviewNotes) return;

  try {
    const route = await resolvePostAuthRoute();
    const fallback = isApproved ? 'Active' : 'OnboardingStep2';
    if (route.screen && route.screen !== fallback) {
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
  response: NotificationResponseLike,
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
    case 'driver:review_notes':
      void reactToDriverReviewPush(type, navigate, data?.reason, data?.message_id);
      break;
    case 'payment:deposited':
      navigate('Earnings');
      break;
    case 'driver:commission_debt_block':
      navigate('PayCommissionDebt');
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
