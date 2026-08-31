import * as Location from 'expo-location';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { ChatBackground } from '../components/ChatBackground';
import { ChatBubble } from '../components/ChatBubble';
import { OTPInput } from '../components/OTPInput';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTripChat } from '../hooks/useTripChat';
import { buildTripCancelledParams } from '../lib/cancellation';
import { mergeTripUpdate } from '../lib/mergeTrip';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const WAIT_SECONDS = 300;
const AMBER_THRESHOLD = 120;

export const WaitingPassengerScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const insets = useSafeAreaInsets();
  const [seconds, setSeconds] = useState(WAIT_SECONDS);
  const [inputText, setInputText] = useState('');
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [displayAddress, setDisplayAddress] = useState<string | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  const activeTripId = useTripStore((s) => s.activeTripId);
  const clearTrip = useTripStore((s) => s.clearTrip);
  const trip = useTripStore((s) => s.trip);

  const { messages, sendMessage } = useTripChat(activeTripId, 'driver');

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    Location.reverseGeocodeAsync({ latitude: trip.origin_lat, longitude: trip.origin_lng })
      .then((results) => {
        if (cancelled || !results.length) return;
        const r = results[0];
        const parts = [r.name || r.street, r.district, r.city].filter(Boolean).join(', ');
        if (parts) setDisplayAddress(parts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip?.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');
    sendMessage(text);
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timerDisplay = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const timerColor = seconds > AMBER_THRESHOLD ? theme.colors.turquoise : theme.colors.amber;

  const handleStartTripPress = () => {
    setVerificationCode('');
    setVerificationError('');
    setShowVerificationModal(true);
  };

  const handleVerifyAndStart = async () => {
    if (!activeTripId || verificationCode.length !== 4) return;
    setVerifying(true);
    setVerificationError('');
    try {
      if (__DEV__) {
        console.log('[startTrip] POST', {
          url: `/trips/${activeTripId}/start`,
          code: verificationCode,
          codeLen: verificationCode.length,
          codeChars: verificationCode.split('').map((c: string) => c.charCodeAt(0)),
        });
      }
      const res = await apiClient.post(`/trips/${activeTripId}/start`, {
        verification_code: verificationCode,
      });
      setShowVerificationModal(false);
      const storeTrip = useTripStore.getState().trip;
      const merged = mergeTripUpdate(storeTrip, res.data);
      if (merged) {
        useTripStore.getState().setActiveTrip(merged);
      }
      navigation.navigate('TripInProgress');
    } catch (err: any) {
      const isTokenExpired =
        err?.code === 'TOKEN_REQUIRED' ||
        err?.code === 'TOKEN_EXPIRED' ||
        err?.error?.code === 'TOKEN_REQUIRED' ||
        err?.error?.code === 'TOKEN_EXPIRED';
      if (isTokenExpired) {
        setShowVerificationModal(false);
        Alert.alert('Sesion expirada', 'Tu sesion ha expirado. Inicia sesion nuevamente.', [
          {
            text: 'OK',
            onPress: () => {
              clearTrip();
              navigation.replace('Welcome');
            },
          },
        ]);
        return;
      }
      const message = err instanceof Error ? err.message : 'No se pudo iniciar el viaje.';
      setVerificationError(message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <StatusBar barStyle="dark-content" />
      {showVerificationModal && (
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Código de verificación</Text>
              <Text style={styles.modalText}>Pedile al pasajero el código de 4 dígitos</Text>
              <OTPInput
                length={4}
                value={verificationCode}
                onChange={(val) => {
                  setVerificationCode(val);
                  if (verificationError) setVerificationError('');
                }}
              />
              {verificationError ? (
                <Text style={styles.verificationError}>{verificationError}</Text>
              ) : null}
              <Button
                title="CONFIRMAR"
                variant="cta"
                onPress={handleVerifyAndStart}
                loading={verifying}
                disabled={verificationCode.length !== 4}
                style={styles.modalButton}
              />
              <Button
                title="CANCELAR"
                onPress={() => setShowVerificationModal(false)}
                style={styles.modalButton}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <Text style={styles.arrivedLabel}>Llegaste</Text>
        <View style={[styles.timerCircle, { borderColor: timerColor }]}>
          <Text style={[styles.timerText, { color: timerColor }]}>{timerDisplay}</Text>
        </View>
        <Text style={styles.totalWait}>5:00</Text>
        <Text style={styles.waitingFor}>Esperando al pasajero</Text>
        <Text style={styles.address} numberOfLines={2}>
          en {displayAddress ?? trip?.origin_address ?? 'Origen'}
        </Text>
        {trip?.pickup_instructions ? (
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsLabel}>📝</Text>
            <Text style={styles.instructionsText}>{trip.pickup_instructions}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.chatArea}>
        <ChatBackground />
        <ScrollView
          ref={chatScrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg.text} isDriver={msg.sender_role === 'driver'} />
          ))}
        </ScrollView>
      </View>

      <View
        style={[
          styles.footer,
          { paddingBottom: theme.dimensions.tabBarHeight + insets.bottom + theme.spacing.sm },
        ]}
      >
        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Escribi un mensaje..."
            placeholderTextColor={theme.colors.mediumGray}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity onPress={handleSend}>
            <Text style={styles.sendIcon}>→</Text>
          </TouchableOpacity>
        </View>
        {seconds === 0 ? (
          <Button
            title="Cancelar por no-show"
            variant="danger"
            onPress={async () => {
              if (!trip?.id) return;
              try {
                const res = await apiClient.post(`/trips/${trip.id}/cancel`, {
                  reason: 'no_show',
                });
                const payload = res.data?.data ?? res.data;
                clearTrip();
                navigation.replace('TripCancelled', buildTripCancelledParams(payload));
              } catch (err: unknown) {
                const message =
                  err && typeof err === 'object' && 'error' in err
                    ? String((err as { error?: { message?: string } }).error?.message)
                    : 'No se pudo cancelar.';
                Alert.alert('Error', message);
              }
            }}
            style={styles.button}
          />
        ) : null}
        <Button title="INICIAR VIAJE" onPress={handleStartTripPress} style={styles.button} />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    alignItems: 'center',
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: 2,
  },
  arrivedLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  timerCircle: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    borderWidth: 4,
    borderColor: theme.colors.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  totalWait: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  waitingFor: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  address: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  instructionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.turquoise,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
    width: 327,
  },
  instructionsLabel: {
    fontSize: theme.fontSize.sm,
  },
  instructionsText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.deepBlue,
    flex: 1,
  },
  chatArea: {
    height: 120,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.lightGray,
    padding: theme.spacing.sm,
    overflow: 'hidden',
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.white,
  },
  chatScroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  chatContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 48,
    borderRadius: theme.radius.inputRadius,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  chatInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    padding: 0,
  },
  sendIcon: {
    fontSize: 18,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.bold,
  },
  button: {
    width: '100%',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: 310,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  modalIcon: {
    fontSize: 32,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  modalText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    width: 270,
    lineHeight: 20,
  },
  modalButton: {
    width: 270,
  },
  verificationError: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
});
