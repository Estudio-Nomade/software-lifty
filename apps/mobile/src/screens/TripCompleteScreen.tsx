import { useLocalSearchParams } from 'expo-router';
import React, { useRef, useEffect } from 'react';
import { Alert, Animated, StatusBar, StyleSheet, Text, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { TabBar, type TabKey } from '../components/TabBar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useOnlineStore } from '../store/onlineStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR')}`;

export const TripCompleteScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const activeTripId = useTripStore((s) => s.activeTripId);
  const clearTrip = useTripStore((s) => s.clearTrip);
  const [activeTab, setActiveTab] = React.useState<TabKey>('home');
  const [collecting, setCollecting] = React.useState(false);
  const [collectingMP, setCollectingMP] = React.useState(false);
  const isOnline = useOnlineStore((s) => s.isOnline);

  const { amount, commission, driverEarnings } = useLocalSearchParams<{
    amount?: string;
    commission?: string;
    driverEarnings?: string;
  }>();

  const tripAmount = Number(amount) || 2500;
  const tripCommission = Number(commission) || 500;
  const tripDriverEarnings = Number(driverEarnings) || 2000;

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const handleCollect = async () => {
    if (!activeTripId) return;
    setCollecting(true);
    try {
      await apiClient.put(`/trips/${activeTripId}/collect`, { payment_method: 'cash' });
      Alert.alert('Cobrado', 'El viaje fue cobrado exitosamente.', [
        {
          text: 'OK',
          onPress: () => {
            clearTrip();
            navigation.navigate('Online');
          },
        },
      ]);
    } catch {
      Alert.alert('Error', 'No se pudo registrar el cobro.');
    } finally {
      setCollecting(false);
    }
  };

  const handleCollectMP = async () => {
    if (!activeTripId) return;
    setCollectingMP(true);
    try {
      await apiClient.put(`/trips/${activeTripId}/collect`, { payment_method: 'mercadopago' });
      Alert.alert('Cobrado', 'El viaje fue cobrado exitosamente por Mercado Pago.', [
        {
          text: 'OK',
          onPress: () => {
            clearTrip();
            navigation.navigate('Online');
          },
        },
      ]);
    } catch {
      Alert.alert('Error', 'No se pudo registrar el cobro.');
    } finally {
      setCollectingMP(false);
    }
  };

  const handleGoHome = () => {
    clearTrip();
    navigation.navigate('Online');
  };

  const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.completedLabel}>Viaje completado!</Text>
        <Text style={styles.earnedLabel}>Ganaste</Text>
        <Text style={styles.earnedAmount}>{formatCurrency(tripAmount)}</Text>

        <View style={styles.breakdown}>
          <Text style={styles.breakdownItem}>
            Comision Lifty: -{formatCurrency(tripCommission)}
          </Text>
          <Text style={styles.breakdownItemEarnings}>
            Tu ganancia: {formatCurrency(tripDriverEarnings)}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryDestination}>Terminal de Omnibus</Text>
          <Text style={styles.summaryInfo}>5 min · 3.2 km</Text>
        </View>

        <Button
          title="Cobre en efectivo"
          onPress={handleCollect}
          loading={collecting}
          style={styles.button}
        />
        <Button
          title="Cobre por Mercado Pago"
          onPress={handleCollectMP}
          loading={collectingMP}
          variant="secondary"
          style={styles.button}
        />
        <Button
          title="VOLVER AL INICIO"
          variant="secondary"
          onPress={handleGoHome}
          style={styles.button}
        />
      </Animated.View>
      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    gap: theme.spacing.lg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  completedLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  earnedLabel: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  earnedAmount: {
    fontSize: theme.fontSize['5xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  breakdown: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  breakdownItem: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  breakdownItemEarnings: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  summaryCard: {
    width: 300,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.lightGray,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  summaryDestination: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
  },
  summaryInfo: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  button: {
    width: 300,
  },
});
