import type React from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../../theme';

interface SkeletonCardProps {
  style?: ViewStyle;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ style }) => {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.container, { opacity: pulse }, style]}>
      <View style={styles.line} />
      <View style={[styles.line, styles.lineShort]} />
      <View style={[styles.line, styles.lineShort]} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    shadowColor: theme.colors.deepBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  line: {
    height: 16,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.sm,
  },
  lineShort: {
    width: '70%',
  },
});
