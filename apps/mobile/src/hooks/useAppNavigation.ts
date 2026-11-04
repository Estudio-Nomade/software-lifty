import { useRouter, useSegments } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { SCREEN_TO_ROUTE, type ScreenName, routePathForScreen } from '../lib/screenRoutes';

export type { ScreenName };
export { routePathForScreen };

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

const BACK_FALLBACK: Record<string, string> = {
  'onboarding-vehicle': 'OnboardingStep1',
  'onboarding-step2': 'OnboardingVehicle',
  'kyc-verify': 'OnboardingStep1',
  'kyc-webview': 'KYCVerify',
  'waiting-approval': 'OnboardingStep2',
  'select-district': 'SelectProvince',
  'district-terms': 'SelectDistrict',
  support: 'Profile',
  terms: 'Profile',
  messages: 'Profile',
  'cancellation-policy': 'Profile',
  'pay-commission-debt': 'Earnings',
};

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
    if (router.canGoBack()) {
      router.back();
      return;
    }

    const current = segmentsRef.current;
    const currentRoute = current[current.length - 1] ?? '';
    const fallback = BACK_FALLBACK[currentRoute];
    if (fallback) {
      replace(fallback);
    } else {
      console.log('[nav] goBack blocked: nothing to go back to');
    }
  }, [router, replace]);

  return useMemo(() => ({ navigate, goBack, replace }), [navigate, goBack, replace]);
}
