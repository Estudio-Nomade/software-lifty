import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export function TripCompleteScreen() {
  const { replace } = useAppNavigation();
  const [rating, setRating] = useState(0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Ionicons name="checkmark-circle" size={64} color={theme.colors.primary} />
        <Text style={styles.title}>¡Viaje completado!</Text>
        <Text style={styles.amount}>$3.500</Text>
        <Text style={styles.subtitle}>Av. Corrientes → Av. 9 de Julio</Text>

        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Distancia</Text>
            <Text style={styles.detailValue}>5.2 km</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duración</Text>
            <Text style={styles.detailValue}>18 min</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Conductor</Text>
            <Text style={styles.detailValue}>Juan Pérez</Text>
          </View>
        </View>

        <Text style={styles.rateTitle}>¿Cómo fue tu viaje?</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((s) => (
            <TouchableOpacity key={s} onPress={() => setRating(s)}>
              <Ionicons
                name={s <= rating ? 'star' : 'star-outline'}
                size={32}
                color={s <= rating ? theme.colors.amber : theme.colors.mediumGray}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Button variant="primary" onPress={() => replace('Home')} style={styles.button}>
          VOLVER AL INICIO
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  amount: {
    fontSize: theme.fontSize['4xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  detailCard: {
    width: '100%',
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  detailValue: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  rateTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.md,
  },
  stars: { flexDirection: 'row', gap: theme.spacing.sm },
  button: { width: '100%', marginTop: theme.spacing.md },
});
