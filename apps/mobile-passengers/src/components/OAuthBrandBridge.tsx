import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { isOAuthBrandBridgeActive, subscribeOAuthBrandBridge } from '../lib/postOAuthHandoff';
import { theme } from '../theme';

/**
 * Root cover during Google OAuth handoff — plain bg only (no L+tagline).
 * BrandSplash is boot/Welcome only so Google success never re-flashes the lockup.
 */
export function OAuthBrandBridge() {
  const active = useSyncExternalStore(
    subscribeOAuthBrandBridge,
    isOAuthBrandBridgeActive,
    () => false,
  );

  if (!active) return null;

  return (
    <View
      style={styles.overlay}
      pointerEvents="auto"
      accessibilityLabel="Completando inicio de sesion"
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colors.background,
    zIndex: 1000,
    elevation: 1000,
  },
});
