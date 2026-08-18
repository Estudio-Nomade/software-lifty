import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getRideHistory } from '../api/passenger';
import type { Trip } from '../api/types';
import { BottomTabBar } from '../components/BottomTabBar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const LIMIT = 20;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: theme.colors.amber },
  offered: { label: 'Ofertado', color: theme.colors.amber },
  request_received: { label: 'Solicitado', color: theme.colors.amber },
  accepted: { label: 'Conductor asignado', color: theme.colors.deepBlue },
  en_route: { label: 'En camino', color: theme.colors.deepBlue },
  waiting: { label: 'Conductor llegó', color: theme.colors.deepBlue },
  completed: { label: 'Completado', color: theme.colors.primary },
  cancelled: { label: 'Cancelado', color: theme.colors.dangerRed },
  cancelled_early: { label: 'Cancelado', color: theme.colors.dangerRed },
  cancelled_late: { label: 'Cancelado', color: theme.colors.dangerRed },
  rejected: { label: 'Rechazado', color: theme.colors.mediumGray },
  expired: { label: 'Expirado', color: theme.colors.mediumGray },
  rated: { label: 'Completado', color: theme.colors.primary },
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

function TripCard({ trip, onSupport }: { trip: Trip; onSupport: () => void }) {
  const status = STATUS_MAP[trip.status] ?? { label: trip.status, color: theme.colors.mediumGray };
  const cancelled = trip.status.startsWith('cancelled');

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
            {trip.origin_address ? shortAddress(trip.origin_address) : '—'}
          </Text>
        </View>
        <View style={styles.addressRow}>
          <View style={styles.dotDest} />
          <Text style={styles.addressText} numberOfLines={1}>
            {trip.dest_address ? shortAddress(trip.dest_address) : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.tripFooter}>
        <Text style={styles.tripFare}>
          {trip.total_fare != null ? formatCurrency(trip.total_fare) : '—'}
        </Text>
        {trip.driver_name && <Text style={styles.driverName}>{trip.driver_name}</Text>}
      </View>
      {cancelled ? (
        <TouchableOpacity onPress={onSupport}>
          <Text style={styles.supportLink}>Contactar soporte</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function TripHistoryScreen() {
  const { goBack, navigate } = useAppNavigation();
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

  const isInitialLoading = isLoading && page === 1;

  const hasMore = Array.isArray(data) && data.length === LIMIT;

  const handleLoadMore = () => {
    if (!isFetching && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={goBack}>
        <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
      </TouchableOpacity>
      <Text style={styles.title}>Historial de viajes</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  const renderErrorFooter = () => {
    if (!error) return null;
    return (
      <View style={styles.errorFooter}>
        <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.dangerRed} />
        <Text style={styles.errorFooterText}>Error al cargar más viajes</Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Text style={styles.retryInlineText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  };

  let content: React.ReactNode;

  if (isInitialLoading) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  } else if (error && allTrips.length === 0) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.mediumGray} />
        <Text style={styles.errorText}>No se pudo cargar</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (allTrips.length === 0) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="car-outline" size={48} color={theme.colors.mediumGray} />
        <Text style={styles.emptyTitle}>Sin viajes aún</Text>
        <Text style={styles.emptySub}>Tus viajes aparecerán aquí</Text>
      </View>
    );
  } else {
    content = (
      <FlatList
        style={styles.list}
        data={allTrips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TripCard trip={item} onSupport={() => navigate('Support')} />}
        contentContainerStyle={styles.listContent}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          <>
            {isFetching && (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={{ paddingVertical: theme.spacing.md }}
              />
            )}
            {renderErrorFooter()}
          </>
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {renderHeader()}
      <View style={styles.body}>{content}</View>
      <BottomTabBar activeTab="trips" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.lightGray },
  body: { flex: 1 },
  list: { flex: 1 },
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
  supportLink: {
    marginTop: 8,
    color: theme.colors.primary,
    fontWeight: '600',
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
  errorFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  errorFooterText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
  },
  retryInlineText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
});
