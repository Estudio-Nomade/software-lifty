import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

type Props = {
  onDismiss?: () => void;
};

export function OutOfServiceAreaBanner({ onDismiss }: Props) {
  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel="Todavía no estamos en tu zona"
    >
      <View style={styles.iconWell}>
        <Ionicons name="map-outline" size={22} color={theme.colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Todavía no estamos en tu zona</Text>
        <Text style={styles.body}>
          Lifty aún no opera donde estás. Te vamos a avisar cuando habilitemos tu ciudad.
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
          <Ionicons name="close" size={18} color={theme.colors.mediumGray} />
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
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
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
  body: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    lineHeight: 16,
  },
  dismiss: {
    padding: 2,
  },
});
