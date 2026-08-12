import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import type { Trip, TripStatus } from '../api/types';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { TabBar, type TabKey } from '../components/TabBar';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';

const LIMIT = 20;

const STATUS_MAP: Record<TripStatus, { label: string; color: string }> = {
  completed: { label: 'Completado', color: theme.colors.turquoise },
  rated: { label: 'Calificado', color: theme.colors.turquoise },
  in_trip: { label: 'En viaje', color: theme.colors.deepBlue },
  en_route: { label: 'En ruta', color: theme.colors.deepBlue },
  waiting: { label: 'Esperando', color: theme.colors.deepBlue },
  accepted: { label: 'Aceptado', color: theme.colors.amber },
  offered: { label: 'Ofrecido', color: theme.colors.amber },
  request_received: { label: 'Pendiente', color: theme.colors.mediumGray },
  expired: { label: 'Expirado', color: theme.colors.mediumGray },
  cancelled: { label: 'Cancelado', color: theme.colors.dangerRed },
  cancelled_early: { label: 'Cancelado', color: theme.colors.dangerRed },
  cancelled_late: { label: 'Cancelado', color: theme.colors.dangerRed },
  rejected: { label: 'Rechazado', color: theme.colors.dangerRed },
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortAddress = (address: string) => {
  const parts = address.split(',');
  return parts.length > 1 ? parts[0].trim() : address;
};

const paymentLabel = (method: string | null) => {
  if (!method) return '—';
  if (method === 'cash') return 'Efectivo';
  if (method === 'transfer') return 'Transferencia';
  return method;
};

interface TripCardProps {
  trip: Trip;
}

const TripCard: React.FC<TripCardProps> = ({ trip }) => {
  const statusInfo = STATUS_MAP[trip.status as TripStatus];

  return (
    <Card style={styles.tripCard} padding={theme.spacing.md}>
      <View style={styles.tripHeader}>
        <Text style={styles.tripDate}>{formatDate(trip.created_at)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
          <Text style={styles.statusText}>{statusInfo.label}</Text>
        </View>
      </View>
      <View style={styles.tripAddress}>
        <Text style={styles.tripAddressText} numberOfLines={1}>
          {trip.origin_address ? shortAddress(trip.origin_address) : '—'}
        </Text>
        <Text style={styles.tripArrow}>↓</Text>
        <Text style={styles.tripAddressText} numberOfLines={1}>
          {trip.dest_address ? shortAddress(trip.dest_address) : '—'}
        </Text>
      </View>
      <View style={styles.tripFooter}>
        <Text style={styles.tripFare}>{formatCurrency(trip.total_fare ?? 0)}</Text>
        <Text style={styles.tripPayment}>{paymentLabel(trip.payment_method)}</Text>
      </View>
    </Card>
  );
};

export const TripHistoryScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [page, setPage] = useState(1);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const isOnline = useOnlineStore((s) => s.isOnline);
  const [activeTab, setActiveTab] = useState<TabKey>('trips');

  const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'profile') navigation.navigate('Profile');
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery<Trip[]>({
    queryKey: ['trip-history', page],
    queryFn: async () => {
      const response = await apiClient.get(`/trips/history?page=${page}&limit=${LIMIT}`);
      return response.data.data ?? response.data;
    },
  });

  useEffect(() => {
    if (data && Array.isArray(data)) {
      setAllTrips((prev) => (page === 1 ? data : [...prev, ...data]));
    }
  }, [data, page]);

  const hasMore = Array.isArray(data) && data.length === LIMIT;
  const isInitialLoading = isLoading && page === 1;
  const isRefreshingMore = (isFetching && page > 1) || (isLoading && page > 1);

  const loadMore = () => {
    if (hasMore && !isFetching) {
      setPage((prev) => prev + 1);
    }
  };

  const renderFooter = () => {
    if (isRefreshingMore) {
      return (
        <View style={styles.loadMoreContainer}>
          <ActivityIndicator size="small" color={theme.colors.turquoise} />
        </View>
      );
    }
    if (hasMore && allTrips.length > 0) {
      return (
        <TouchableOpacity style={styles.loadMoreButton} activeOpacity={0.7} onPress={loadMore}>
          <Text style={styles.loadMoreText}>Cargar mas</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const renderContent = () => {
    if (isInitialLoading) {
      return (
        <View style={styles.content}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.content}>
          <Card style={styles.errorCard} padding={theme.spacing.lg}>
            <Text style={styles.errorText}>No se pudo cargar</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </Card>
        </View>
      );
    }

    if (allTrips.length === 0) {
      return (
        <View style={styles.content}>
          <Card style={styles.emptyCard} padding={theme.spacing.lg}>
            <Text style={styles.emptyText}>No tenes viajes todavia</Text>
          </Card>
        </View>
      );
    }

    return (
      <FlatList
        style={{ flex: 1 }}
        data={allTrips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TripCard trip={item} />}
        contentContainerStyle={styles.content}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Historial" onBack={() => navigation.goBack()} showBack />
      <View style={{ flex: 1 }}>{renderContent()}</View>
      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.dimensions.tabBarHeight + theme.spacing['2xl'],
  },
  tripCard: {
    width: 343,
    gap: theme.spacing.sm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripDate: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  statusText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  tripAddress: {
    gap: 2,
    marginTop: 2,
  },
  tripAddressText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  tripArrow: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  tripFare: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  tripPayment: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  loadMoreContainer: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.buttonRadius,
    backgroundColor: theme.colors.deepBlue,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  loadMoreText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  errorCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.dangerRed,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  emptyCard: {
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
});
