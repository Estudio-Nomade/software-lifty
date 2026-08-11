import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export function TripInProgressScreen() {
  const { navigate } = useAppNavigation();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mapArea}>
        <Ionicons name="map-outline" size={48} color={theme.colors.deepBlue} />
        <Text style={styles.mapLabel}>Mapa</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            <Ionicons name="person" size={28} color={theme.colors.mediumGray} />
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.statusText}>Tu conductor viene en camino</Text>
            <Text style={styles.driverName}>Juan Pérez</Text>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleDetail}>⭐ 4.8</Text>
              <Text style={styles.vehicleDetail}>Toyota Corolla</Text>
              <Text style={styles.vehicleDetail}>ABC 123</Text>
            </View>
            <Text style={styles.eta}>⏱ 5 min</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button variant="secondary" onPress={() => navigate('Chat')} style={styles.actionBtn}>
            💬 Chat
          </Button>
          <Button variant="secondary" onPress={() => {}} style={styles.actionBtn}>
            📞 Llamar
          </Button>
        </View>

        <Button variant="danger" onPress={() => navigate('Home')} style={styles.cancelBtn}>
          CANCELAR VIAJE
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.lightGray },
  mapArea: {
    flex: 1,
    backgroundColor: '#B8D4E3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLabel: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.sm,
  },
  content: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  driverCard: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInfo: { flex: 1, gap: 2 },
  statusText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
  driverName: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  vehicleRow: { flexDirection: 'row', gap: theme.spacing.sm },
  vehicleDetail: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  eta: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.amber,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', gap: theme.spacing.md },
  actionBtn: { flex: 1 },
  cancelBtn: { width: '100%' },
});
