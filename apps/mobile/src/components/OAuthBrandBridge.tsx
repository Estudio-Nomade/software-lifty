import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { isOAuthBrandBridgeActive, subscribeOAuthBrandBridge } from '../lib/postOAuthHandoff';
import { BrandSplash } from './BrandSplash';

/**
 * Root-level single BrandSplash during Google OAuth.
 * AuthCallback / Welcome must NOT paint a second BrandSplash while this is up.
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
    >
      <BrandSplash />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
});
