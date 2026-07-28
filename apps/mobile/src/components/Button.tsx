import type React from 'react';
import {
  ActivityIndicator,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { theme } from '../theme';

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
      backgroundColor: theme.colors.turquoise,
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
    },
    text: {
      color: theme.colors.white,
    },
  },
  secondary: {
    container: {
      backgroundColor: 'transparent',
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: theme.colors.mediumGray,
    },
    text: {
      color: theme.colors.mediumGray,
    },
  },
  danger: {
    container: {
      backgroundColor: 'transparent',
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
      borderWidth: 1.5,
      borderColor: theme.colors.dangerRed,
    },
    text: {
      color: theme.colors.dangerRed,
    },
  },
  cta: {
    container: {
      backgroundColor: theme.colors.turquoise,
      height: theme.dimensions.buttonCTAHeight,
      borderRadius: theme.radius.buttonRadius,
    },
    text: {
      color: theme.colors.white,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
    },
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: theme.colors.turquoise,
    },
    text: {
      color: theme.colors.turquoise,
      textTransform: 'uppercase',
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
      activeOpacity={0.8}
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
    width: 327,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },
  disabled: {
    opacity: 0.4,
  },
});
