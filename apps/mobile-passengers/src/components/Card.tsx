import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  padding?: keyof typeof theme.spacing;
}

export function Card({ children, style, padding = 'md' }: CardProps) {
  return <View style={[styles.card, { padding: theme.spacing[padding] }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    ...theme.shadows.card,
  },
});
