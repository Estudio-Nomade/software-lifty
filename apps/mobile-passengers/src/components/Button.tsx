import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { theme } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'cta';

interface ButtonProps {
  variant?: ButtonVariant;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  style?: ViewStyle;
}

export function Button({
  variant = 'primary',
  onPress,
  disabled,
  loading,
  children,
  style,
}: ButtonProps) {
  const variantStyles = stylesByVariant[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles.container,
        isDisabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.label.color as string} />
      ) : (
        <Text style={[styles.label, variantStyles.label]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: theme.dimensions.buttonHeight,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    fontFamily: theme.fontFamily.semibold,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});

const stylesByVariant: Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> = {
  primary: {
    container: { backgroundColor: theme.colors.primary },
    label: { color: theme.colors.white },
  },
  secondary: {
    container: {
      backgroundColor: theme.colors.white,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
    },
    label: { color: theme.colors.primary },
  },
  danger: {
    container: { backgroundColor: theme.colors.dangerRed },
    label: { color: theme.colors.white },
  },
  cta: {
    container: {
      backgroundColor: theme.colors.primary,
      height: theme.dimensions.buttonCTAHeight,
    },
    label: { color: theme.colors.white },
  },
};
