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

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'cta' | 'outline';

interface ButtonProps {
  variant?: ButtonVariant;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  variant = 'primary',
  onPress,
  disabled,
  loading,
  children,
  style,
  textStyle,
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
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={(variantStyles.label.color as string) ?? theme.colors.white} />
      ) : (
        <Text style={[styles.label, variantStyles.label, textStyle]} numberOfLines={1}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'stretch',
    height: theme.dimensions.buttonHeight,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    fontFamily: theme.fontFamily.semibold,
    letterSpacing: 0.1,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.85,
  },
});

const stylesByVariant: Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> = {
  primary: {
    container: {
      backgroundColor: theme.colors.primary,
      ...theme.shadows.button,
    },
    label: { color: theme.colors.white },
  },
  secondary: {
    container: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    label: { color: theme.colors.deepBlue },
  },
  danger: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.colors.dangerRed,
    },
    label: { color: theme.colors.dangerRed },
  },
  cta: {
    container: {
      backgroundColor: theme.colors.primary,
      height: theme.dimensions.buttonCTAHeight,
      ...theme.shadows.button,
    },
    label: { color: theme.colors.white },
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.colors.primary,
    },
    label: { color: theme.colors.primary },
  },
};
