import { useLocalSearchParams } from 'expo-router';
import React, { useRef, useEffect } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { reportTags } from '../api/types';
import { Button } from '../components/Button';
import { StarRating } from '../components/StarRating';
import { TabBar, type TabKey } from '../components/TabBar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useOnlineStore } from '../store/onlineStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR')}`;

type Step = 'collect' | 'rate';

export const TripCompleteScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const activeTripId = useTripStore((s) => s.activeTripId);
  const trip = useTripStore((s) => s.trip);
  const clearTrip = useTripStore((s) => s.clearTrip);
  const [activeTab, setActiveTab] = React.useState<TabKey>('home');
  const [step, setStep] = React.useState<Step>('collect');
  const [collecting, setCollecting] = React.useState(false);
  const [collectingMP, setCollectingMP] = React.useState(false);
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const isOnline = useOnlineStore((s) => s.isOnline);

  const { amount, commission, driverEarnings, tipAmount } = useLocalSearchParams<{
    amount?: string;
    commission?: string;
    driverEarnings?: string;
    tipAmount?: string;
  }>();

  const tripAmount = Number(amount) || 2500;
  const tripCommission = Number(commission) || 500;
  const tripDriverEarnings = Number(driverEarnings) || 2000;
  const tip = Number(tipAmount) || 0;

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

  const goOnline = () => {
    clearTrip();
    navigation.navigate('Online');
  };

  const handleCollect = async () => {
    if (!activeTripId) return;
    setCollecting(true);
    try {
      await apiClient.put(`/trips/${activeTripId}/collect`, { payment_method: 'cash' });
      setStep('rate');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el cobro.';
      Alert.alert('Error', message);
    } finally {
      setCollecting(false);
    }
  };

  const handleCollectMP = async () => {
    if (!activeTripId) return;
    setCollectingMP(true);
    try {
      await apiClient.put(`/trips/${activeTripId}/collect`, { payment_method: 'mercadopago' });
      setStep('rate');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el cobro.';
      Alert.alert('Error', message);
    } finally {
      setCollectingMP(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!activeTripId || rating === 0) return;
    setSubmitting(true);
    try {
      const body: { rating: number; tags?: string; comment?: string } = { rating };
      if (selectedTags.length > 0) body.tags = selectedTags.join(',');
      if (comment.trim()) body.comment = comment.trim();
      await apiClient.post(`/ratings/trips/${activeTripId}`, body);
      goOnline();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar la calificación.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipRating = () => {
    goOnline();
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };

  const renderCollectStep = () => (
    <>
      <Text style={styles.completedLabel}>Viaje completado!</Text>
      <Text style={styles.earnedLabel}>Ganaste</Text>
      <Text style={styles.earnedAmount}>{formatCurrency(tripAmount)}</Text>

      <View style={styles.breakdown}>
        <Text style={styles.breakdownItem}>
          Comision Lifty (
          {tripCommission === 0 ? '0%' : `${Math.round((tripCommission / tripAmount) * 100)}%`}): -
          {formatCurrency(tripCommission)}
        </Text>
        {tripCommission === 0 && (
          <View style={styles.promoBadge}>
            <Text style={styles.promoBadgeText}>Sin comision!</Text>
          </View>
        )}
        {tip > 0 ? (
          <Text style={styles.breakdownItemTip}>Propina: +{formatCurrency(tip)}</Text>
        ) : null}
        <Text style={styles.breakdownItemEarnings}>
          Tu ganancia: {formatCurrency(tripDriverEarnings + tip)}
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryDestination}>
          {trip?.dest_address ?? trip?.origin_address ?? 'Destino'}
        </Text>
        <Text style={styles.summaryInfo}>
          {trip?.duration_minutes != null ? `${Math.round(trip.duration_minutes)} min` : ''}
          {trip?.duration_minutes != null && trip?.distance_km != null ? ' · ' : ''}
          {trip?.distance_km != null ? `${trip.distance_km} km` : ''}
        </Text>
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
    </>
  );

  const renderRateStep = () => (
    <>
      <Text style={styles.completedLabel}>Viaje completado!</Text>
      <Text style={styles.rateTitle}>Como fue tu pasajero?</Text>

      <StarRating rating={rating} onRate={setRating} />

      <View style={styles.reportSection}>
        <Text style={styles.reportLabel}>Reportar un problema (opcional)</Text>
        <View style={styles.tagsContainer}>
          {reportTags.map((tag) => {
            const selected = selectedTags.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                onPress={() => toggleTag(tag)}
                style={[styles.tag, selected && styles.tagSelected]}
              >
                <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TextInput
        style={styles.commentInput}
        placeholder="Deja un comentario (opcional)"
        placeholderTextColor={theme.colors.mediumGray}
        value={comment}
        onChangeText={setComment}
        multiline
        textAlignVertical="top"
      />

      <Button
        title="Enviar calificacion"
        onPress={handleSubmitRating}
        loading={submitting}
        disabled={rating === 0}
        style={styles.button}
      />
      <Button title="Omitir" variant="secondary" onPress={handleSkipRating} style={styles.button} />
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {step === 'collect' ? renderCollectStep() : renderRateStep()}
        </Animated.View>
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: theme.spacing['2xl'],
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
  breakdownItemTip: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  breakdownItemEarnings: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  promoBadge: {
    backgroundColor: theme.colors.turquoise,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    marginTop: 4,
  },
  promoBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
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
  rateTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  reportSection: {
    width: 300,
    gap: theme.spacing.sm,
  },
  reportLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  tag: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
  },
  tagSelected: {
    backgroundColor: theme.colors.turquoise,
    borderColor: theme.colors.turquoise,
  },
  tagText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  tagTextSelected: {
    color: theme.colors.white,
    fontWeight: theme.fontWeight.medium,
  },
  commentInput: {
    width: 300,
    minHeight: 80,
    maxHeight: 120,
    borderRadius: theme.radius.inputRadius,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  button: {
    width: 300,
  },
});
