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

function resolveFontFamily(style: TextProps['style']): string | undefined {
  if (!style) return undefined;
  const flattened = StyleSheet.flatten(style);
  const weight = flattened.fontWeight;
  if (weight === undefined) return undefined;
  if (typeof weight === 'string') return fontFamilyByWeight[weight];
  return fontFamilyByWeight[String(weight)];
}

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(
  ({ style, ...props }, ref) => {
    const fontFamily = resolveFontFamily(style);

    const mergedStyle = fontFamily ? ([{ fontFamily }, style] as const).flat() : style;

    return <RNText ref={ref} style={mergedStyle} {...props} />;
  },
);

Text.displayName = 'Text';
