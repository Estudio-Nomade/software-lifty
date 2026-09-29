import { type ComponentRef, forwardRef } from 'react';
import { Text as RNText, StyleSheet, type TextProps } from 'react-native';
import { theme } from '../../theme';

const fontFamilyByWeight: Record<string, string> = {
  '400': theme.fontFamily.regular,
  '500': theme.fontFamily.medium,
  '600': theme.fontFamily.semibold,
  '700': theme.fontFamily.bold,
  normal: theme.fontFamily.regular,
  medium: theme.fontFamily.medium,
  bold: theme.fontFamily.bold,
};

function resolveFontFamily(style: TextProps['style']): string {
  if (!style) return theme.fontFamily.regular;
  const flattened = StyleSheet.flatten(style);
  const weight = flattened.fontWeight;
  if (weight === undefined) return theme.fontFamily.regular;
  if (typeof weight === 'string') return fontFamilyByWeight[weight] ?? theme.fontFamily.regular;
  return fontFamilyByWeight[String(weight)] ?? theme.fontFamily.regular;
}

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(
  ({ style, ...props }, ref) => {
    const fontFamily = resolveFontFamily(style);
    return <RNText ref={ref} style={[{ fontFamily }, style]} {...props} />;
  },
);

Text.displayName = 'Text';
