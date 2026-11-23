import { useRouter, useSegments } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { BACK_FALLBACK } from '../lib/backFallback';
import { SCREEN_TO_ROUTE, type ScreenName, routePathForScreen } from '../lib/screenRoutes';

export type { ScreenName };
export { routePathForScreen };
export { BACK_FALLBACK };

export interface ScreenParams {
  KYCWebView: { url: string };
  UploadDocument: { docType: string; docLabel: string; mode?: string };
  TripComplete: {
    amount?: string;
    commission?: string;
    driverEarnings?: string;
    tipAmount?: string;
  };
}

export function useAppNavigation() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const navigate = useCallback(
    (screen: string, params?: Record<string, string>) => {
      const route = SCREEN_TO_ROUTE[screen as ScreenName];
      if (!route) return;
      if (params && Object.keys(params).length > 0) {
        router.push({ pathname: route, params });
      } else {
        router.push(route);
      }
    },
    [router],
  );

  const replace = useCallback(
    (screen: string, params?: Record<string, string>) => {
      const route = SCREEN_TO_ROUTE[screen as ScreenName];
      if (!route) return;
      if (params && Object.keys(params).length > 0) {
        router.replace({ pathname: route, params });
      } else {
        router.replace(route);
      }
    },
    [router],
  );

  const goBack = useCallback(() => {
    const current = segmentsRef.current;
    const currentRoute = current[current.length - 1] ?? '';
    // Tab Viajes: always home — never pop into TyC / random stack under the tab.
    if (currentRoute === 'trip-history') {
      replace(BACK_FALLBACK['trip-history'] ?? 'Active');
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    const fallback = BACK_FALLBACK[currentRoute];
    if (fallback) {
      replace(fallback);
    } else {
      console.log('[nav] goBack blocked: nothing to go back to');
    }
  }, [router, replace]);

  return useMemo(() => ({ navigate, goBack, replace }), [navigate, goBack, replace]);
}
