import { useLocalSearchParams } from 'expo-router';
import React, { useRef, useEffect } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { reportTags } from '../api/types';
import { Button } from '../components/Button';
import { StarRating } from '../components/StarRating';
import { TabBar } from '../components/TabBar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR')}`;

type Step = 'collect' | 'rate';

export const TripCompleteScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const activeTripId = useTripStore((s) => s.activeTripId);
  const clearTrip = useTripStore((s) => s.clearTrip);
  const [activeTab, setActiveTab] = React.useState<'home' | 'earnings' | 'profile'>('home');
  const [step, setStep] = React.useState<Step>('collect');
  const [collecting, setCollecting] = React.useState(false);
  const [collectingMP, setCollectingMP] = React.useState(false);
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

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
      setStep('rate');
    } catch {
      Alert.alert('Error', 'No se pudo registrar el cobro.');
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
    } catch {
      Alert.alert('Error', 'No se pudo enviar la calificación.');
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

  const renderCollectStep = () => (
    <>
      <Text style={styles.completedLabel}>Viaje completado!</Text>
      <Text style={styles.earnedLabel}>Ganaste</Text>
      <Text style={styles.earnedAmount}>{formatCurrency(tripAmount)}</Text>

      <View style={styles.breakdown}>
        <Text style={styles.breakdownItem}>Comision Lifty: -{formatCurrency(tripCommission)}</Text>
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
      <TabBar activeTab={activeTab} onTabPress={setActiveTab} />
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
