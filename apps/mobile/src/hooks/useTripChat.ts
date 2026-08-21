import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { apiClient } from '../api/client';
import type { TripMessage } from '../api/types';
import {
  createOptimisticMessage,
  mergeHistory,
  mergeMessages,
  replaceOptimistic,
} from '../lib/chatMessages';
import { sendMessage, subscribeToTripChannel } from '../lib/realtime';

export function useTripChat(
  activeTripId: string | null | undefined,
  senderRole: TripMessage['sender_role'],
) {
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const messagesRef = useRef<TripMessage[]>([]);
  const activeTripIdRef = useRef(activeTripId);
  activeTripIdRef.current = activeTripId;

  const commitMessages = useCallback((updater: (prev: TripMessage[]) => TripMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activeTripId) {
      commitMessages(() => []);
      return;
    }
    let cancelled = false;

    // Start fresh so messages from a previous trip never leak into this one.
    commitMessages(() => []);

    const unsubscribe = subscribeToTripChannel(activeTripId, {
      onMessage: (msg) => {
        if (cancelled) return;
        commitMessages((prev) => mergeMessages(prev, msg));
      },
    });

    apiClient
      .get(`/trips/${activeTripId}/messages`)
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.data ?? res.data;
        if (Array.isArray(rows)) commitMessages((prev) => mergeHistory(prev, rows));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeTripId, commitMessages]);

  const send = useCallback(
    async (text: string) => {
      const tripId = activeTripIdRef.current;
      const trimmed = text.trim();
      if (!trimmed || !tripId) return;

      const optimistic = createOptimisticMessage(tripId, senderRole, trimmed);
      commitMessages((prev) => [...prev, optimistic]);

      try {
        const row = await sendMessage(tripId, trimmed);
        commitMessages((prev) => replaceOptimistic(prev, optimistic.id, row));
      } catch {
        // Only surface an error if the optimistic bubble is still pending. If
        // the broadcast already confirmed the message (the request may have
        // timed out after the server committed), skip the misleading alert.
        if (messagesRef.current.some((m) => m.id === optimistic.id)) {
          commitMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          Alert.alert('Error', 'No se pudo enviar el mensaje.');
        }
      }
    },
    [senderRole, commitMessages],
  );

  return { messages, sendMessage: send };
}
