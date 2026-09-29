import type React from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
}

export const Card: React.FC<CardProps> = ({ children, style, padding }) => {
  return <View style={[styles.card, padding ? { padding } : null, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    width: '100%',
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.06)',
    ...theme.shadows.card,
  },
});
