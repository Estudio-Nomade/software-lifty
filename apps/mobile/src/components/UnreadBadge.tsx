import type React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

type UnreadBadgeProps = {
  count: number;
  /** smaller for tab icons / avatar corners */
  size?: 'sm' | 'md';
  testID?: string;
};

export const UnreadBadge: React.FC<UnreadBadgeProps> = ({ count, size = 'md', testID }) => {
  if (!count || count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  const sm = size === 'sm';
  return (
    <View
      testID={testID}
      style={[styles.badge, sm ? styles.badgeSm : null]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.text, sm ? styles.textSm : null]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dangerRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
  },
  badgeSm: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
  },
  text: {
    fontSize: 10,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
    lineHeight: 12,
  },
  textSm: {
    fontSize: 9,
    lineHeight: 11,
  },
});
