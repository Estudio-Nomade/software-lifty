import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { apiClient } from '../api/client';
import type { DriverStatus, Trip } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { useAuthStore } from '../store/authStore';
import { useTripStore } from '../store/tripStore';
import { buildTripCancelledParams } from './cancellation';
import { refreshMessagesUnread } from './messagesUnread';
import { resolvePostAuthRoute, routeForDriverStatus } from './postAuthRouting';

interface PermStatus {
  status: string;
  granted: boolean;
  canAskAgain?: boolean;
}

/** Result of asking OS permission + Expo token + optional backend register. */
export type PushRegistrationReason =
  | 'unavailable'
  | 'project_id_missing'
  | 'permission_denied'
  | 'token_null'
  | 'register_error'
  | 'post_failed';

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: PushRegistrationReason; message: string; canOpenSettings?: boolean };

export const PUSH_PERMISSION_DENIED_MSG = 'Activá notificaciones en Ajustes para recibir viajes';

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
  // Guard first: static top-level import breaks Expo Go Android (SDK 53+).
  // Lazy require (not top-level) keeps load deferred; Jest can mock the module.
  if (!isRemotePushAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch (err) {
    console.warn('[push] expo-notifications load failed', err);
    return null;
  }
}

export async function setupNotificationHandler(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    // Presentation only. Unread badge is owned by refreshMessagesUnread
    // (receive listener / session restore / inbox focus) — avoid double-count.
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      // Allow OS to apply payload.badge from Expo; store still refreshed via API.
      shouldSetBadge: true,
    }),
  });
}

/** Foreground/background receipt listener — keep unread badges warm without requiring a tap. */
export async function addNotificationReceivedListener(
  listener: (notification: {
    request: { content: { data?: Record<string, string | undefined> } };
  }) => void,
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  try {
    return Notifications.addNotificationReceivedListener(
      listener as Parameters<typeof Notifications.addNotificationReceivedListener>[0],
    );
  } catch {
    return null;
  }
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

/**
 * Request notification permission, create Android channels, obtain Expo push token.
 * Does not POST to backend — use ensurePushRegistration for full path.
 */
export async function registerForPush(): Promise<string | null> {
  const result = await obtainPushToken();
  return result.ok ? result.token : null;
}

async function obtainPushToken(): Promise<PushRegistrationResult> {
  if (!isRemotePushAvailable()) {
    return {
      ok: false,
      reason: 'unavailable',
      message:
        'Push remoto no disponible en este runtime (web o Expo Go Android). Usá un build preview/dev.',
    };
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Módulo de notificaciones no disponible.',
    };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.slug;
  if (!projectId) {
    console.warn('[push] projectId missing (eas.projectId / slug)');
    return {
      ok: false,
      reason: 'project_id_missing',
      message: 'Falta projectId de Expo para obtener el token push.',
    };
  }

  try {
    const perm = (await Notifications.requestPermissionsAsync()) as unknown as PermStatus;
    if (perm.status !== 'granted') {
      console.warn('[push] permission not granted', perm.status, {
        canAskAgain: perm.canAskAgain,
      });
      return {
        ok: false,
        reason: 'permission_denied',
        message: PUSH_PERMISSION_DENIED_MSG,
        canOpenSettings: perm.canAskAgain === false || perm.status === 'denied',
      };
    }

    if (Platform.OS === 'android') {
      // Legacy default channel (other trip alerts). Sound settings freeze after first
      // create on device — keep for backward-compat payloads without channelId.
      await Notifications.setNotificationChannelAsync('trip-requests', {
        name: 'Trip Requests',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
      // Dedicated offer channel so custom sound is not stuck on old channel settings.
      await Notifications.setNotificationChannelAsync('trip-offers', {
        name: 'Ofertas de viaje',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'trip-request.wav',
        vibrationPattern: [0, 400, 200, 400, 200, 400],
        enableVibrate: true,
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
    if (!token?.data) {
      console.warn('[push] getExpoPushTokenAsync returned empty token');
      return {
        ok: false,
        reason: 'token_null',
        message: 'No se pudo obtener el token de notificaciones.',
      };
    }
    return { ok: true, token: token.data };
  } catch (err) {
    console.warn('[push] registerForPush failed', err);
    return {
      ok: false,
      reason: 'register_error',
      message: 'Error al registrar notificaciones. Reintentá en unos segundos.',
    };
  }
}

/**
 * Full path: permission → Expo token → POST /notifications/token.
 * Call on session restore and again on GO so deny/error is never silent.
 */
export async function ensurePushRegistration(): Promise<PushRegistrationResult> {
  const obtained = await obtainPushToken();
  if (!obtained.ok) return obtained;

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
  if (!platform) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Plataforma no soportada para push nativo.',
    };
  }

  try {
    await apiClient.post('/notifications/token', {
      token: obtained.token,
      platform,
    });
    return obtained;
  } catch (err) {
    console.warn('[push] POST /notifications/token failed', err);
    return {
      ok: false,
      reason: 'post_failed',
      message: 'No se pudo registrar el token de notificaciones. Revisá la conexión.',
    };
  }
}

/** Open OS app settings so the driver can re-enable notifications after deny. */
export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (err) {
    console.warn('[push] openSettings failed', err);
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
    void refreshMessagesUnread();
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

function isOfferTrip(trip: Trip | null | undefined): trip is Trip {
  return !!trip && (trip.status === 'request_received' || trip.status === 'offered');
}

/**
 * Push tap for trip:request often lands with empty trip store (Realtime never ran in bg).
 * Hydrate via /trips/active or /trips/:id before IncomingRequest so AuthRedirect + screen
 * poll do not dismiss as "no active trip".
 */
export async function hydrateTripOfferFromPush(
  tripId: string | undefined,
  navigate: (screen: string, params?: Record<string, string>) => void,
): Promise<void> {
  const store = useTripStore.getState();
  if (isOfferTrip(store.trip) && (!tripId || store.trip.id === tripId)) {
    navigate('IncomingRequest');
    return;
  }

  let hydrated: Trip | null = null;
  try {
    const { data } = await apiClient.get('/trips/active');
    const active = (data?.data ?? data) as Trip | null;
    if (isOfferTrip(active) && (!tripId || active.id === tripId)) {
      hydrated = active;
    }
  } catch {
    /* try detail */
  }

  if (!hydrated && tripId) {
    try {
      const { data } = await apiClient.get(`/trips/${tripId}`);
      const detail = (data?.data ?? data) as Trip | null;
      if (isOfferTrip(detail)) {
        hydrated = detail;
      }
    } catch {
      /* navigate anyway — IncomingRequest retries active */
    }
  }

  if (hydrated) {
    useTripStore.getState().setActiveTrip(hydrated);
  }
  navigate('IncomingRequest');
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
      void hydrateTripOfferFromPush(data?.trip_id, navigate);
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
