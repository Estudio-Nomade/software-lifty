import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const VEHICLES = [
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
  { id: 'van', name: 'Van', icon: 'bus', eta: '18 min', capacity: '6 pasajeros', price: '$4.800' },
];

export function VehicleSelectScreen() {
  const { goBack, navigate } = useAppNavigation();
  const [selected, setSelected] = React.useState('auto');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={goBack} style={styles.navBtn}>
          <Ionicons name="close" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.mapPreview}>
        <Ionicons name="map-outline" size={48} color={theme.colors.deepBlue} />
        <Text style={styles.mapLabel}>Mapa - Ruta</Text>
      </View>

      <View style={styles.routeSummary}>
        <Ionicons name="location" size={16} color={theme.colors.dangerRed} />
        <Text style={styles.routeAddr}>Av. Corrientes</Text>
        <Ionicons name="arrow-forward" size={16} color={theme.colors.mediumGray} />
        <Ionicons name="location" size={16} color={theme.colors.primary} />
        <Text style={styles.routeAddr}>Av. 9 de Julio</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Selecciona tu vehículo</Text>

        {VEHICLES.map((v) => (
          <TouchableOpacity
            key={v.id}
            style={[styles.vehicleCard, selected === v.id && styles.vehicleSelected]}
            onPress={() => setSelected(v.id)}
          >
            <Ionicons name={v.icon as any} size={28} color={theme.colors.deepBlue} />
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
            <Text style={styles.footerAddr}>Av. 9 de Julio 1234</Text>
          </View>
          <Button
            variant="cta"
            onPress={() => navigate('TripInProgress')}
            style={styles.solicitarBtn}
          >
            SOLICITAR {VEHICLES.find((v) => v.id === selected)?.price}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

import React from 'react';

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
  mapPreview: {
    height: 180,
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
