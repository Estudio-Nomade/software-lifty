import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDirections, requestRide } from '../api/passenger';
import { Button } from '../components/Button';
import { PassengerMap } from '../components/Map/PassengerMap';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLocationStore } from '../store/locationStore';
import { theme } from '../theme';

interface Vehicle {
  id: 'auto' | 'moto';
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  eta: string;
  capacity: string;
  price: string;
}

const VEHICLES: Vehicle[] = [
  {
    id: 'auto',
    name: 'Auto',
    icon: 'car',
    eta: '15 min',
    capacity: '4 pasajeros',
    price: '$3.500',
  },
  {
    id: 'moto',
    name: 'Moto',
    icon: 'bicycle',
    eta: '12 min',
    capacity: '1 pasajero',
    price: '$2.100',
  },
];

export function VehicleSelectScreen() {
  const { goBack, navigate } = useAppNavigation();
  const current = useLocationStore((s) => s.current);
  const { pickup, destination, pickupLat, pickupLng, destLat, destLng } = useLocalSearchParams<{
    pickup?: string;
    destination?: string;
    pickupLat?: string;
    pickupLng?: string;
    destLat?: string;
    destLng?: string;
  }>();
  const [selected, setSelected] = useState<Vehicle['id']>('auto');
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    const originLat = Number(pickupLat);
    const originLng = Number(pickupLng);
    const destLatNum = Number(destLat);
    const destLngNum = Number(destLng);

    if (
      Number.isNaN(originLat) ||
      Number.isNaN(originLng) ||
      Number.isNaN(destLatNum) ||
      Number.isNaN(destLngNum)
    ) {
      Alert.alert('Ubicación no disponible', 'No pudimos obtener tu ubicación. Reintentá.');
      return;
    }

    setLoading(true);
    try {
      const dir = await getDirections({
        origin_lat: originLat,
        origin_lng: originLng,
        dest_lat: destLatNum,
        dest_lng: destLngNum,
      });

      const trip = await requestRide({
        origin_lat: originLat,
        origin_lng: originLng,
        dest_lat: destLatNum,
        dest_lng: destLngNum,
        origin_address: pickup || '',
        dest_address: destination || '',
        vehicle_type: selected,
        distance_km: dir.distance_km,
        duration_minutes: dir.duration_minutes,
      });

      navigate('ConnectingDriver', { tripId: trip.id });
    } catch {
      Alert.alert('No se pudo solicitar el viaje', 'Intentalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={goBack} style={styles.navBtn}>
          <Ionicons name="close" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        <PassengerMap
          centerCoordinate={current ? [current.lng, current.lat] : [-58.3816, -34.6037]}
          userLocation={current ? [current.lng, current.lat] : null}
          style={styles.mapFill}
        />
      </View>

      <View style={styles.routeSummary}>
        <Ionicons name="location" size={16} color={theme.colors.dangerRed} />
        <Text style={styles.routeAddr} numberOfLines={1}>
          {pickup || 'Origen'}
        </Text>
        <Ionicons name="arrow-forward" size={16} color={theme.colors.mediumGray} />
        <Ionicons name="location" size={16} color={theme.colors.primary} />
        <Text style={styles.routeAddr} numberOfLines={1}>
          {destination || 'Destino'}
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Selecciona tu vehículo</Text>

        {VEHICLES.map((v) => (
          <TouchableOpacity
            key={v.id}
            style={[styles.vehicleCard, selected === v.id && styles.vehicleSelected]}
            onPress={() => setSelected(v.id)}
          >
            <Ionicons name={v.icon} size={28} color={theme.colors.deepBlue} />
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleName}>{v.name}</Text>
              <View style={styles.vehicleMeta}>
                <Text style={styles.vehicleDetail}>⏱ {v.eta}</Text>
                <Text style={styles.vehicleDetail}>{v.capacity}</Text>
              </View>
            </View>
            <Text style={styles.vehiclePrice}>{v.price}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Ionicons name="location-outline" size={16} color={theme.colors.mediumGray} />
            <Text style={styles.footerAddr} numberOfLines={1}>
              {destination || ''}
            </Text>
          </View>
          <Button
            variant="cta"
            onPress={handleRequest}
            loading={loading}
            style={styles.solicitarBtn}
          >
            SOLICITAR {VEHICLES.find((v) => v.id === selected)?.price}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  navbar: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.white,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  navBtn: {
    alignSelf: 'flex-start',
    padding: theme.spacing.sm,
  },
  mapContainer: {
    height: 180,
    backgroundColor: theme.colors.lightGray,
  },
  mapFill: {
    flex: 1,
  },
  routeSummary: {
    height: 48,
    backgroundColor: theme.colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  routeAddr: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  vehicleSelected: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  vehicleInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  vehicleName: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  vehicleMeta: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  vehicleDetail: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  vehiclePrice: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  footerAddr: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  solicitarBtn: {
    width: '100%',
  },
});
