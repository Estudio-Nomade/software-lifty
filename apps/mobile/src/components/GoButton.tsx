import type React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

export const GO_SIZE = 88;

interface GoButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /**
   * Distance from screen bottom to the GO circle (above sheet/tab bar).
   * Omit when `embedded` — parent stack owns positioning.
   */
  bottom?: number;
  /** Flow inside a parent column stack instead of absolute screen coords. */
  embedded?: boolean;
}

export const GoButton: React.FC<GoButtonProps> = ({
  onPress,
  loading = false,
  disabled = false,
  bottom = 0,
  embedded = false,
}) => {
  const isDisabled = disabled || loading;

  return (
    <View
      style={embedded ? styles.wrapEmbedded : [styles.wrap, { bottom }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.button, isDisabled && styles.disabled]}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Conectarse"
      >
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.white} />
        ) : (
          <Text style={styles.label}>GO</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 6,
  },
  wrapEmbedded: {
    alignItems: 'center',
    zIndex: 6,
  },
  button: {
    width: GO_SIZE,
    height: GO_SIZE,
    borderRadius: GO_SIZE / 2,
    backgroundColor: theme.colors.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: theme.colors.white,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
  },
});
