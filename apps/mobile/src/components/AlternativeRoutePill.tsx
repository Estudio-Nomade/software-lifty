import { theme } from '@/theme';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

interface AlternativeRoutePillProps {
  primaryTime: number;
  altTime: number;
  onToggle: () => void;
}

export const AlternativeRoutePill: React.FC<AlternativeRoutePillProps> = ({
  primaryTime,
  altTime,
  onToggle,
}) => {
  const delta = altTime - primaryTime;
  const deltaSign = delta >= 0 ? '+' : '';
  const deltaText = `${deltaSign}${Math.round(delta)} min`;

  return (
    <TouchableOpacity style={styles.pill} onPress={onToggle} activeOpacity={0.8}>
      <Text style={styles.text}>
        Alternativa: {Math.round(altTime)} min ({deltaText})
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 140,
    alignSelf: 'center',
    backgroundColor: 'rgba(13, 43, 69, 0.85)',
    borderWidth: 1,
    borderColor: theme.colors.amber,
    borderRadius: theme.radius.full,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    zIndex: 10,
  },
  text: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
});
