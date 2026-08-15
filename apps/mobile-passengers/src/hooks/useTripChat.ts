import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { listTripMessages, sendTripMessage } from '../api/passenger';
import type { TripMessage } from '../api/types';
import { subscribeToTripChannel } from '../lib/realtime';

const isTempId = (id: string) => id.startsWith('local-');

export function useTripChat(
  tripId: string | null | undefined,
  senderRole: TripMessage['sender_role'],
) {
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const tripIdRef = useRef(tripId);
  tripIdRef.current = tripId;

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    const unsubscribe = subscribeToTripChannel(tripId, (msg: TripMessage) => {
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
    });

    listTripMessages(tripId)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tripId]);

  const send = useCallback(
    async (text: string) => {
      const id = tripIdRef.current;
      const trimmed = text.trim();
      if (!trimmed || !id) return;

      const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: TripMessage = {
        id: tempId,
        trip_id: id,
        sender_id: 'me',
        sender_role: senderRole,
        text: trimmed,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);

      try {
        const row = await sendTripMessage(id, trimmed);
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
