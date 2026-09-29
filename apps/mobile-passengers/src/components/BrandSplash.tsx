import { Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

const MARK_L = require('../../assets/lifty-mark-l.png');

/** Boot bridge: L + Lifty + tagline (no CTAs). Same stack as Welcome brand. */
export function BrandSplash() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      <View style={styles.brand}>
        <Image source={MARK_L} style={styles.mark} resizeMode="contain" />
        <Text style={styles.wordmark}>Lifty</Text>
        <Text style={styles.tagline}>Movilidad que te eleva</Text>
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
    marginBottom: theme.spacing.xs,
  },
  wordmark: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.8,
  },
  tagline: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    maxWidth: 280,
  },
});
