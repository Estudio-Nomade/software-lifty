import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview/lib/WebView';
import type { WebViewErrorEvent, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import { apiClient } from '../api/client';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
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

  const finish = () => {
    if (done) return;
    setDone(true);
    const sessionId = useAuthStore.getState().kycSessionId;
    if (sessionId) {
      apiClient.get(`/kyc/decision/${sessionId}`).catch(() => {});
      useAuthStore.getState().setKycSessionId(null);
    }
    navigation.navigate('OnboardingVehicle');
  };

  const handleRequest = (request: WebViewNavigation): boolean => {
    if (request.url.startsWith(CALLBACK_PREFIX)) {
      finish();
      return false;
    }
    return true;
  };

  const handleError = (e: WebViewErrorEvent) => {
    const { url: errorUrl, description } = e.nativeEvent;
    const desc = description ?? '';
    if (errorUrl?.startsWith(CALLBACK_PREFIX) || desc.includes('liftyviajes')) {
      finish();
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
          if (navState.url.startsWith(CALLBACK_PREFIX)) finish();
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
