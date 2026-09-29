import type React from 'react';
import {
  ActivityIndicator,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'cta' | 'outline';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  outlineColor?: string;
  disabled?: boolean;
  loading?: boolean;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: {
      backgroundColor: theme.colors.primary,
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
      ...theme.shadows.button,
    },
    text: {
      color: theme.colors.white,
    },
  },
  secondary: {
    container: {
      backgroundColor: theme.colors.surfaceMuted,
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
    },
    text: {
      color: theme.colors.deepBlue,
    },
  },
  danger: {
    container: {
      backgroundColor: 'transparent',
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.colors.dangerRed,
    },
    text: {
      color: theme.colors.dangerRed,
    },
  },
  cta: {
    container: {
      backgroundColor: theme.colors.primary,
      height: theme.dimensions.buttonCTAHeight,
      borderRadius: theme.radius.buttonRadius,
      ...theme.shadows.button,
    },
    text: {
      color: theme.colors.white,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.semibold,
    },
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.colors.primary,
    },
    text: {
      color: theme.colors.primary,
    },
  },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  outlineColor,
  borderRadius,
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const variantStyle = variantStyles[variant];

  const outlineOverride =
    variant === 'outline' && outlineColor
      ? { borderColor: outlineColor, color: outlineColor }
      : null;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        variantStyle.container,
        disabled && styles.disabled,
        borderRadius !== undefined && { borderRadius },
        outlineOverride && { borderColor: outlineOverride.borderColor },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={outlineOverride?.color ?? variantStyle.text.color} />
      ) : (
        <Text
          style={[
            styles.text,
            variantStyle.text,
            outlineOverride && { color: outlineOverride.color },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  text: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.1,
  },
  disabled: {
    opacity: 0.45,
  },
});
