import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { Text } from '../ui/Text';

export type SnackbarTone = 'warning' | 'error';

interface SnackbarProps {
  visible: boolean;
  title: string;
  message: string;
  tone?: SnackbarTone;
  distanceMeters?: number | null;
  /** Extra lift above safe-area bottom (tab bar, sheet floor, FAB). */
  bottomOffset?: number;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4500;

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export const Snackbar: React.FC<SnackbarProps> = ({
  visible,
  title,
  message,
  tone = 'error',
  distanceMeters = null,
  bottomOffset = 0,
  onDismiss,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) {
      translateY.setValue(140);
      opacity.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 240,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, translateY, opacity]);

  if (!visible) return null;

  const isWarning = tone === 'warning';
  const accentColor = isWarning ? theme.colors.amber : theme.colors.dangerRed;
  const iconName = isWarning ? 'location' : 'alert-circle';
  const bottom = insets.bottom + theme.spacing.md + bottomOffset;

  return (
    <Animated.View style={[styles.snackbar, { opacity, transform: [{ translateY }], bottom }]}>
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <View style={[styles.iconBadge, { backgroundColor: `${accentColor}1A` }]}>
        <Ionicons name={iconName} size={26} color={accentColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {distanceMeters != null ? (
          <View style={styles.distanceChip}>
            <Ionicons name="navigate" size={14} color={theme.colors.turquoise} />
            <Text style={styles.distanceText}>
              A <Text style={styles.distanceValue}>{formatDistance(distanceMeters)}</Text> del
              destino
            </Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Cerrar"
      >
        <Ionicons name="close" size={20} color={theme.colors.mediumGray} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  snackbar: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 24,
    zIndex: 30,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: theme.radius.lg,
    borderBottomLeftRadius: theme.radius.lg,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  content: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  message: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    lineHeight: 20,
  },
  distanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xs,
    backgroundColor: 'rgba(27, 191, 174, 0.1)',
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  distanceText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  distanceValue: {
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
});
