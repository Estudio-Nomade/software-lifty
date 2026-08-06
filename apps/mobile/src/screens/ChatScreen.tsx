import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ChatBubble } from '../components/ChatBubble';
import { LiftyWatermark } from '../components/LiftyWatermark';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { sendMessage, subscribeToTripChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

export const ChatScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const chatScrollRef = useRef<ScrollView>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTripId = useTripStore((s) => s.activeTripId);
  const trip = useTripStore((s) => s.trip);
  const driverId = useAuthStore((s) => s.driverId);

  const scrollToEnd = useCallback(() => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
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
    scrollToEnd();

    try {
      await sendMessage(activeTripId, driverId, text);
    } catch {
      Alert.alert('Error', 'No se pudo enviar el mensaje.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat con {trip?.passenger_name ?? 'Pasajero'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.chatArea}>
          <LiftyWatermark size={90} opacity={0.06} />
          <ScrollView
            ref={chatScrollRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
            showsVerticalScrollIndicator={false}
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
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.deepBlue,
  },
  backButton: {
    paddingVertical: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
  },
  backText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  headerTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  headerSpacer: {
    width: 60,
  },
  chatArea: {
    flex: 1,
    backgroundColor: 'rgba(237, 241, 245, 0.95)',
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.md,
  },
  chatScroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  chatContent: {
    paddingBottom: theme.spacing.md,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: theme.radius.inputRadius,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  chatInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.white,
    padding: 0,
  },
  sendIcon: {
    fontSize: 18,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.bold,
  },
});
