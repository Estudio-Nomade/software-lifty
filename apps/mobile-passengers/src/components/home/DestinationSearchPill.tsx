import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { theme } from '../../theme';

interface DestinationSearchPillProps {
  onPress: () => void;
}

export function DestinationSearchPill({ onPress }: DestinationSearchPillProps) {
  return (
    <TouchableOpacity
      style={styles.pill}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel="¿A dónde vas?"
    >
      <Ionicons name="search" size={20} color={theme.colors.deepBlue} />
      <Text style={styles.label}>¿A dónde vas?</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    height: theme.dimensions.inputHeight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.08)',
    ...theme.shadows.card,
  },
  label: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
});
