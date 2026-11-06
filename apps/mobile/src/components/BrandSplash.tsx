import { Image, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

const MARK_L = require('../../assets/lifty-mark-l.png');

/** Boot bridge: L + Lifty + tagline (no CTAs). Same stack as Welcome brand. */
export function BrandSplash() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.brand}>
        <Image
          source={MARK_L}
          style={styles.mark}
          resizeMode="contain"
          accessibilityLabel="Lifty"
        />
        <Text style={styles.wordmark}>Lifty</Text>
        <View
          style={styles.taglineBlock}
          accessible
          accessibilityRole="text"
          accessibilityLabel="Movilidad que te eleva"
        >
          <Text style={styles.tagline} accessible={false}>
            Movilidad que
          </Text>
          <Text style={styles.tagline} accessible={false}>
            te eleva
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  brand: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  mark: {
    width: 148,
    height: 182,
    resizeMode: 'contain',
    marginBottom: theme.spacing.xs,
  },
  wordmark: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.8,
  },
  taglineBlock: {
    alignItems: 'center',
    maxWidth: 280,
    minHeight: 52,
    gap: 2,
    paddingBottom: theme.spacing.xs,
    overflow: 'visible',
  },
  tagline: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.tagline,
    textAlign: 'center',
    lineHeight: 24,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});
