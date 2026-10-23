import { Ionicons } from '@expo/vector-icons';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatBubble } from '../components/ChatBubble';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTripChat } from '../hooks/useTripChat';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

export function ChatScreen() {
  const { goBack } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const trip = useRideStore((s) => s.activeTrip);
  const [message, setMessage] = useState('');
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tripId = trip?.id;
  const { messages, sendMessage } = useTripChat(tripId, 'passenger');

  const scrollToEnd = useCallback(() => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, scrollToEnd]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const handleSend = () => {
    const text = message.trim();
    if (!text || !tripId) return;
    setMessage('');
    sendMessage(text);
    scrollToEnd();
  };

  const chatBody = (
    <>
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={scrollToEnd}
        showsVerticalScrollIndicator={false}
      >
        {!tripId ? (
          <View style={styles.emptyChat}>
            <Ionicons name="alert-circle-outline" size={48} color={theme.colors.mediumGray} />
            <Text style={styles.emptyText}>No hay un viaje activo para chatear</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.mediumGray} />
            <Text style={styles.emptyText}>Envía un mensaje a tu conductor</Text>
          </View>
        ) : (
          messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg.text} isMine={msg.sender_role === 'passenger'} />
          ))
        )}
      </ScrollView>

      <View
        style={[
          styles.inputBar,
          {
            paddingTop: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
            paddingBottom: theme.spacing.md + insets.bottom,
          },
        ]}
      >
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje..."
          placeholderTextColor={theme.colors.mediumGray}
          value={message}
          onChangeText={setMessage}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={Boolean(tripId)}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !tripId && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!tripId}
          accessibilityLabel="Enviar mensaje"
        >
          <Ionicons name="send" size={22} color={theme.colors.white} />
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={theme.colors.deepBlue} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Chat con {trip?.driver_name ?? 'tu conductor'}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
          {chatBody}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>{chatBody}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(13, 43, 69, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  headerInfo: { alignItems: 'center' },
  headerTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
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
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
