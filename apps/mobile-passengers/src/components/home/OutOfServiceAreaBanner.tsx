import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

type Props = {
  onDismiss?: () => void;
  /** Tighter card for map overlay (Home). Buscar keeps default. */
  compact?: boolean;
};

export function OutOfServiceAreaBanner({ onDismiss, compact = false }: Props) {
  return (
    <View
      style={[styles.card, compact && styles.cardCompact]}
      accessibilityRole="summary"
      accessibilityLabel="Todavía no estamos en tu zona"
    >
      <View style={[styles.iconWell, compact && styles.iconWellCompact]}>
        <Ionicons name="map-outline" size={compact ? 16 : 22} color={theme.colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text
          style={[styles.title, compact && styles.titleCompact]}
          numberOfLines={compact ? 2 : undefined}
        >
          Todavía no estamos en tu zona
        </Text>
        <Text
          style={[styles.body, compact && styles.bodyCompact]}
          numberOfLines={compact ? 3 : undefined}
        >
          {compact
            ? 'Lifty aún no opera acá. Te avisamos al habilitar tu ciudad.'
            : 'Lifty aún no opera donde estás. Te vamos a avisar cuando habilitemos tu ciudad.'}
        </Text>
      </View>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Entendido"
          style={styles.dismiss}
        >
          <Ionicons name="close" size={compact ? 16 : 18} color={theme.colors.mediumGray} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.lightGray,
    ...theme.shadows.card,
  },
  cardCompact: {
    gap: theme.spacing.xs,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs + 2,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWellCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  titleCompact: {
    fontSize: theme.fontSize.xs,
    lineHeight: 15,
  },
  body: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    lineHeight: 16,
  },
  bodyCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  dismiss: {
    padding: 2,
  },
});
