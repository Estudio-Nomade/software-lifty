import type React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

interface GoButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const GoButton: React.FC<GoButtonProps> = ({
  onPress,
  loading = false,
  disabled = false,
}) => {
  const isDisabled = disabled || loading;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
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

const GO_SIZE = 88;

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
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
