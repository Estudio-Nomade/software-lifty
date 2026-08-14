import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { apiClient } from '../api/client';
import { driverStatusSchema } from '../api/types';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { getCurrentPosition } from '../lib/location';
import {
  handleNotificationResponse,
  registerForPush,
  setupNotificationHandler,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useTripStore } from '../store/tripStore';
import { AuthRedirectWatcher } from './AuthRedirectWatcher';
import { LoadingOverlay } from './feedback/LoadingOverlay';

function SessionRestore() {
  useEffect(() => {
    const restore = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        useAuthStore.getState().clearAuth();
        useAuthStore.getState().setSessionRestored(true);
        return;
      }
      useAuthStore.getState().setSession(token, data.session?.user?.id ?? null);

      try {
        const response = await apiClient.get('/auth/me');
        const user = response.data;

        try {
          const meRes = await apiClient.get('/drivers/me');
          const me = meRes.data?.data ?? meRes.data;
          if (me?.id) {
            useAuthStore.getState().setDriverId(me.id);
          }
        } catch {
          if (user?.id) {
            useAuthStore.getState().setDriverId(user.id);
          }
        }

        try {
          const statusRes = await apiClient.get('/drivers/me/status');
          const parsed = driverStatusSchema.safeParse(statusRes.data?.data ?? statusRes.data);
          if (parsed.success) {
            useAuthStore.getState().setDriverStatus(parsed.data.status);
            useAuthStore.getState().setOnboardingStep(parsed.data.step ?? null);
          }
        } catch (statusErr: any) {
          console.log('[SessionRestore] /drivers/me/status ERROR:', statusErr?.message);
        }
      } catch (err: any) {
        console.log('[SessionRestore] /auth/me ERROR:', err?.message);
      } finally {
        useAuthStore.getState().setSessionRestored(true);
      }
    };
    restore();
  }, []);

  return null;
}

function LocationInit() {
  useEffect(() => {
    getCurrentPosition();
  }, []);

  return null;
}

function ActiveTripRecovery() {
  const driverId = useAuthStore((s) => s.driverId);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const driverStatus = useAuthStore((s) => s.driverStatus);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const navigatedRef = useRef(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!driverId || !sessionRestored || driverStatus !== 'approved' || navigatedRef.current)
      return;
    let cancelled = false;
    const check = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get('/trips/active');
        if (cancelled) return;
        const trip = response.data?.data ?? response.data;
        if (trip) {
          useTripStore.getState().setActiveTrip(trip);
          navigatedRef.current = true;
          InteractionManager.runAfterInteractions(() => {
            if (cancelled) return;
            switch (trip.status) {
              case 'request_received':
              case 'offered':
                routerRef.current.replace('/incoming-request');
                break;
              case 'accepted':
              case 'en_route':
                routerRef.current.replace('/navigation');
                break;
              case 'waiting':
                routerRef.current.replace('/waiting-passenger');
                break;
              case 'in_trip':
                routerRef.current.replace('/trip-in-progress');
                break;
              default:
                break;
            }
          });
        }
      } catch (err: any) {
        console.log('[ActiveTripRecovery] /trips/active ERROR:', err?.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [driverId, sessionRestored, driverStatus]);

  if (loading) {
    return <LoadingOverlay visible />;
  }

  return null;
}

function NotificationSetup() {
  const { navigate } = useAppNavigation();

  useEffect(() => {
    setupNotificationHandler();

    registerForPush().then((token) => {
      if (!token) return;
      const { token: authToken, sessionRestored } = useAuthStore.getState();
      if (!authToken || !sessionRestored) return;
      apiClient
        .post('/notifications/token', {
          token,
          platform: Platform.OS,
        })
        .catch(() => {
          // best-effort
        });
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response, navigate);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

export function AppInitializer() {
  return (
    <>
      <AuthRedirectWatcher />
      <SessionRestore />
      <LocationInit />
      <ActiveTripRecovery />
      <NotificationSetup />
    </>
  );
}
