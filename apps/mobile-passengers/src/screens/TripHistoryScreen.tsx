import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getRideHistory } from '../api/passenger';
import type { Trip } from '../api/types';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const LIMIT = 20;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  completed: { label: 'Completado', color: theme.colors.primary },
  cancelled: { label: 'Cancelado', color: theme.colors.dangerRed },
  requested: { label: 'Solicitado', color: theme.colors.amber },
  driver_assigned: { label: 'Conductor asignado', color: theme.colors.deepBlue },
  driver_en_route: { label: 'En camino', color: theme.colors.deepBlue },
  driver_arrived: { label: 'Conductor llegó', color: theme.colors.deepBlue },
  in_trip: { label: 'En viaje', color: theme.colors.primary },
};

function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount: number) {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortAddress(address: string) {
  const parts = address.split(',');
  return parts[0]?.trim() || address;
}

function TripCard({ trip }: { trip: Trip }) {
  const status = STATUS_MAP[trip.status] ?? { label: trip.status, color: theme.colors.mediumGray };

  return (
    <View style={styles.tripCard}>
      <View style={styles.tripHeader}>
        <Text style={styles.tripDate}>{formatDate(trip.created_at)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
          <Text style={styles.statusText}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.tripAddress}>
        <View style={styles.addressRow}>
          <View style={styles.dotPickup} />
          <Text style={styles.addressText} numberOfLines={1}>
            {trip.pickup_address ? shortAddress(trip.pickup_address) : '—'}
          </Text>
        </View>
        <View style={styles.addressRow}>
          <View style={styles.dotDest} />
          <Text style={styles.addressText} numberOfLines={1}>
            {trip.destination_address ? shortAddress(trip.destination_address) : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.tripFooter}>
        <Text style={styles.tripFare}>
          {trip.total_fare || trip.final_fare
            ? formatCurrency(trip.total_fare ?? trip.final_fare!)
            : trip.estimate_fare
              ? `${formatCurrency(trip.estimate_fare)} aprox.`
              : '—'}
        </Text>
        {trip.driver_name && <Text style={styles.driverName}>{trip.driver_name}</Text>}
      </View>
    </View>
  );
}

export function TripHistoryScreen() {
  const { goBack } = useAppNavigation();
  const [page, setPage] = useState(1);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);

  const { isLoading, error, isFetching, refetch, data } = useQuery<Trip[]>({
    queryKey: ['trip-history', page],
    queryFn: () => getRideHistory(page, LIMIT),
  });

  useEffect(() => {
    if (data && Array.isArray(data)) {
      setAllTrips((prev) => (page === 1 ? data : [...prev, ...data]));
    }
  }, [data, page]);

  const hasMore = Array.isArray(data) && data.length === LIMIT;

  const handleLoadMore = () => {
    if (!isFetching && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  if (isLoading && page === 1) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          <Text style={styles.title}>Historial de viajes</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          <Text style={styles.title}>Historial de viajes</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.mediumGray} />
          <Text style={styles.errorText}>No se pudo cargar</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Historial de viajes</Text>
        <View style={{ width: 24 }} />
      </View>

      {allTrips.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="car-outline" size={48} color={theme.colors.mediumGray} />
          <Text style={styles.emptyTitle}>Sin viajes aún</Text>
          <Text style={styles.emptySub}>Tus viajes aparecerán aquí</Text>
        </View>
      ) : (
        <FlatList
          data={allTrips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TripCard trip={item} />}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetching ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={{ paddingVertical: theme.spacing.md }}
              />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.lightGray },
  header: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  listContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  tripCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripDate: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  statusText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.white,
  },
  tripAddress: {
    gap: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dotPickup: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  dotDest: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dangerRed,
  },
  addressText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  tripFare: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  driverName: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  emptySub: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.dangerRed,
  },
  retryBtn: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.white,
  },
});
