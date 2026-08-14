import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { listTripMessages, sendTripMessage } from '../api/passenger';
import type { TripMessage } from '../api/types';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { subscribeToTripChannel } from '../lib/realtime';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

export function ChatScreen() {
  const { goBack } = useAppNavigation();
  const trip = useRideStore((s) => s.activeTrip);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const tripId = trip?.id;

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  useEffect(() => {
    if (!tripId) return;

    listTripMessages(tripId)
      .then((rows) => setMessages(rows))
      .catch(() => {});

    const unsubscribe = subscribeToTripChannel(tripId, (incoming) => {
      setMessages((prev) => {
        if (incoming?.id && prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, incoming];
      });
    });

    return unsubscribe;
  }, [tripId]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || !tripId) return;
    setMessage('');
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        trip_id: tripId,
        sender_id: 'me',
        sender_role: 'passenger',
        text,
        created_at: new Date().toISOString(),
      },
    ]);
    scrollToEnd();
    try {
      await sendTripMessage(tripId, text);
    } catch {
      Alert.alert('Error', 'No se pudo enviar el mensaje.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Chat con {trip?.driver_name ?? 'tu conductor'}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.mediumGray} />
              <Text style={styles.emptyText}>Envía un mensaje a tu conductor</Text>
            </View>
          ) : (
            messages.map((msg) => {
              const mine = msg.sender_role === 'passenger';
              return (
                <View key={msg.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.bubbleText, mine ? styles.mineText : styles.theirsText]}>
                    {msg.text}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Escribe un mensaje..."
            placeholderTextColor={theme.colors.mediumGray}
            value={message}
            onChangeText={setMessage}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <Ionicons name="send" size={22} color={theme.colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  flex: { flex: 1 },
  header: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  headerInfo: { alignItems: 'center' },
  headerTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  chat: { flex: 1, padding: theme.spacing.md },
  chatContent: { flexGrow: 1, gap: theme.spacing.sm, paddingBottom: theme.spacing.md },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.lightGray,
  },
  bubbleText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
  },
  mineText: { color: theme.colors.white },
  theirsText: { color: theme.colors.deepBlue },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
