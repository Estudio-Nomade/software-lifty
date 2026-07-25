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
import { ChatBubble } from '../components/ChatBubble';
import { LiftyWatermark } from '../components/LiftyWatermark';
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

  const activeTripId = useTripStore((s) => s.activeTripId);
  const trip = useTripStore((s) => s.trip);
  const driverId = useAuthStore((s) => s.driverId);

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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat con {trip?.passenger_name ?? 'Pasajero'}</Text>
        <View style={styles.headerSpacer} />
      </View>

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
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
    color: theme.colors.deepBlue,
  },
  headerSpacer: {
    width: 60,
  },
  chatArea: {
    flex: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.lightGray,
    margin: theme.spacing.md,
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
    height: 48,
    borderRadius: theme.radius.inputRadius,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
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
});
