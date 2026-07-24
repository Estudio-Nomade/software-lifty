import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { ChatBubble } from '../components/ChatBubble';
import { LiftyWatermark } from '../components/LiftyWatermark';
import { OTPInput } from '../components/OTPInput';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { sendMessage, subscribeToTripChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const WAIT_SECONDS = 300;
const AMBER_THRESHOLD = 120;

export const WaitingPassengerScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [seconds, setSeconds] = useState(WAIT_SECONDS);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const activeTripId = useTripStore((s) => s.activeTripId);
  const setTripStatus = useTripStore((s) => s.setTripStatus);
  const clearTrip = useTripStore((s) => s.clearTrip);
  const trip = useTripStore((s) => s.trip);
  const driverId = useAuthStore((s) => s.driverId);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeTripId) return;
    const unsubscribe = subscribeToTripChannel(activeTripId, {
      onMessage: (msg) => {
        setMessages((prev) => [...prev, msg]);
      },
    });
    return () => {
      unsubscribe();
    };
  }, [activeTripId]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !activeTripId || !driverId) return;

    setInputText('');

    const optimistic = {
      sender_id: driverId,
      text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await sendMessage(activeTripId, driverId, text);
    } catch {
      Alert.alert('Error', 'No se pudo enviar el mensaje.');
    }
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timerDisplay = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const timerColor = seconds > AMBER_THRESHOLD ? theme.colors.turquoise : theme.colors.amber;
  const hasTimeLeft = seconds > 0;

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
      await apiClient.post(`/trips/${activeTripId}/start`, { verification_code: verificationCode });
      setShowVerificationModal(false);
      setTripStatus('in_trip');
      navigation.navigate('TripInProgress');
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo iniciar el viaje.';
      setVerificationError(message);
    } finally {
      setVerifying(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!activeTripId) return;
    setShowModal(false);
    setLoading(true);
    try {
      await apiClient.post(`/trips/${activeTripId}/cancel`);
      clearTrip();
      navigation.navigate('Online');
    } catch {
      Alert.alert('Error', 'No se pudo cancelar el viaje.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {showModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalIcon}>⚠️</Text>
            <Text style={styles.modalTitle}>Cancelar viaje?</Text>
            <Text style={styles.modalText}>
              {hasTimeLeft
                ? 'Si cancelas antes de los 5 minutos, baja tu tasa de finalizacion.'
                : 'Ya pasaron los 5 minutos de espera. Recibiras una compensacion.'}
            </Text>
            <Button
              title="CANCELAR VIAJE"
              variant="danger"
              onPress={handleCancelConfirm}
              loading={loading}
              style={styles.modalButton}
            />
            <Button
              title="SEGUIR ESPERANDO"
              onPress={() => setShowModal(false)}
              disabled={loading}
              style={styles.modalButton}
            />
          </View>
        </View>
      )}

      {showVerificationModal && (
        <View style={styles.modalOverlay}>
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
        </View>
      )}

      {__DEV__ && (
        <TouchableOpacity
          style={styles.devButton}
          onPress={() => navigation.navigate('PassengerCode')}
        >
          <Text style={styles.devButtonText}>Ver código pasajero</Text>
        </TouchableOpacity>
      )}

      <View style={styles.spacer} />
      <Text style={styles.arrivedLabel}>Llegaste</Text>

      <View style={[styles.timerCircle, { borderColor: timerColor }]}>
        <Text style={[styles.timerText, { color: timerColor }]}>{timerDisplay}</Text>
      </View>

      <Text style={styles.totalWait}>5:00</Text>

      <Text style={styles.waitingFor}>Esperando al pasajero</Text>
      <Text style={styles.address}>en {trip?.origin_address ?? 'Origen'}</Text>

      <View style={styles.chatArea}>
        <LiftyWatermark />
        <ScrollView
          ref={chatScrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg, index) => (
            <ChatBubble key={index} message={msg.text} isDriver={msg.sender_id === driverId} />
          ))}
        </ScrollView>
      </View>

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

      <Button title="INICIAR VIAJE" onPress={handleStartTripPress} style={styles.button} />

      <TouchableOpacity onPress={() => setShowModal(true)}>
        <Text style={styles.cancelLink}>
          {hasTimeLeft ? 'Cancelar viaje' : 'Cancelar con compensacion'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  spacer: {
    height: 24,
  },
  arrivedLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  timerCircle: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.full,
    borderWidth: 4,
    borderColor: theme.colors.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  totalWait: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  waitingFor: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  address: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  chatArea: {
    width: 343,
    flex: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.lightGray,
    padding: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
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
    width: 343,
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
    width: 327,
  },
  cancelLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.md,
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
  devButton: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: theme.colors.turquoise,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    zIndex: 5,
  },
  devButtonText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
});
