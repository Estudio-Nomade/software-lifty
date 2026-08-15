import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { apiClient } from '../api/client';
import type { TripMessage } from '../api/types';
import { sendMessage, subscribeToTripChannel } from '../lib/realtime';

const isTempId = (id: string) => id.startsWith('local-');

export function useTripChat(activeTripId: string | null, senderRole: TripMessage['sender_role']) {
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const activeTripIdRef = useRef(activeTripId);
  activeTripIdRef.current = activeTripId;

  useEffect(() => {
    if (!activeTripId) return;
    let cancelled = false;

    const unsubscribe = subscribeToTripChannel(activeTripId, {
      onMessage: (msg: TripMessage) => {
        if (cancelled) return;
        setMessages((prev) => {
          if (msg.id && prev.some((m) => m.id === msg.id)) return prev;
          const tempIndex = prev.findIndex(
            (m) => isTempId(m.id) && m.text === msg.text && m.sender_role === msg.sender_role,
          );
          if (tempIndex !== -1) {
            const next = [...prev];
            next[tempIndex] = msg;
            return next;
          }
          return [...prev, msg];
        });
      },
    });

    apiClient
      .get(`/trips/${activeTripId}/messages`)
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.data ?? res.data;
        if (Array.isArray(rows)) setMessages(rows);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeTripId]);

  const send = useCallback(
    async (text: string) => {
      const tripId = activeTripIdRef.current;
      const trimmed = text.trim();
      if (!trimmed || !tripId) return;

      const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: TripMessage = {
        id: tempId,
        trip_id: tripId,
        sender_id: 'me',
        sender_role: senderRole,
        text: trimmed,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);

      try {
        const row = await sendMessage(tripId, trimmed);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? row : m)));
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        Alert.alert('Error', 'No se pudo enviar el mensaje.');
      }
    },
    [senderRole],
  );

  return { messages, sendMessage: send };
}
