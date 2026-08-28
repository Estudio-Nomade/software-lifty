import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { STEP_ROUTE, routeForDriverStatus } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

// Must match DIDIT_CALLBACK_URL configured on the backend. DIDIT redirects the
// hosted flow here (with ?status=&verificationSessionId=) when it finishes.
const CALLBACK_PREFIX = 'https://liftyviajes.com/kyc/callback';

export const KYCWebViewScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { url } = useLocalSearchParams<{ url: string }>();
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  /**
   * After Didit: refresh decision, then route by real status step.
   * Never hardcode OnboardingVehicle — that caused a blank vehicle form before
   * KYC was approved (PUT → KYC_REQUIRED), then a second fill after approval.
   */
  const finish = async () => {
    if (done) return;
    setDone(true);

    const sessionId = useAuthStore.getState().kycSessionId;
    if (sessionId) {
      try {
        await apiClient.get(`/kyc/decision/${sessionId}`);
      } catch {
        // decision may still be processing
      }
      useAuthStore.getState().setKycSessionId(null);
    }

    try {
      const { data: body } = await apiClient.get('/drivers/me/status');
      const payload = body?.data ?? body;
      const parsed = driverStatusSchema.safeParse(payload);
      const driverData = (parsed.success ? parsed.data : payload) as DriverStatus;

      if (driverData.status) {
        useAuthStore.getState().setDriverStatus(driverData.status);
      }
      if (driverData.step) {
        useAuthStore.getState().setOnboardingStep(driverData.step);
      }

      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[driver-onboarding] post-KYC step', driverData.step, driverData.kyc_status);
      }

      const route = routeForDriverStatus(driverData);
      if (route.screen) {
        navigation.replace(route.screen);
        return;
      }
    } catch {
      // fall through
    }

    // Safe default while Didit processes: stay in KYC flow, not vehicle.
    navigation.replace(STEP_ROUTE.kyc.screen);
  };

  const handleRequest = (request: WebViewNavigation): boolean => {
    if (request.url.startsWith(CALLBACK_PREFIX)) {
      void finish();
      return false;
    }
    return true;
  };

  const handleError = (e: WebViewErrorEvent) => {
    const { url: errorUrl, description } = e.nativeEvent;
    const desc = description ?? '';
    if (errorUrl?.startsWith(CALLBACK_PREFIX) || desc.includes('liftyviajes')) {
      void finish();
    }
  };

  if (!url) {
    return (
      <View style={styles.container}>
        <Navbar title="Verificacion" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>No se pudo abrir la verificacion.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Verificacion" onBack={() => navigation.goBack()} />
      <WebView
        source={{ uri: url }}
        onShouldStartLoadWithRequest={handleRequest}
        onNavigationStateChange={(navState) => {
          if (navState.url.startsWith(CALLBACK_PREFIX)) void finish();
        }}
        onError={handleError}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        style={styles.webview}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  webview: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFill as object),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
});
