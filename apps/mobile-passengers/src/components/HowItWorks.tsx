import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface Step {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: 'locate-outline',
    title: 'Buscá tu destino',
    description: 'Elegí a dónde querés ir',
  },
  {
    icon: 'car-outline',
    title: 'Elegí tu vehículo',
    description: 'El que mejor se adapte',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Viajá seguro',
    description: 'Conductores verificados',
  },
];

export function HowItWorks() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>¿Cómo funciona?</Text>
      {STEPS.map((step) => (
        <View key={step.title} style={styles.step}>
          <View style={styles.iconCircle}>
            <Ionicons name={step.icon} size={18} color={theme.colors.deepBlue} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepDesc}>{step.description}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
  stepTitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  stepDesc: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
});
