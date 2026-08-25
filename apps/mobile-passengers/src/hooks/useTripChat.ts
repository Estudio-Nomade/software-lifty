import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { listTripMessages, sendTripMessage } from '../api/passenger';
import type { TripMessage } from '../api/types';
import {
  createOptimisticMessage,
  mergeHistory,
  mergeMessages,
  replaceOptimistic,
} from '../lib/chatMessages';
import { subscribeToTripChannel } from '../lib/realtime';

export function useTripChat(
  tripId: string | null | undefined,
  senderRole: TripMessage['sender_role'],
) {
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [ready, setReady] = useState(false);
  const messagesRef = useRef<TripMessage[]>([]);
  const tripIdRef = useRef(tripId);
  tripIdRef.current = tripId;

  const commitMessages = useCallback((updater: (prev: TripMessage[]) => TripMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!tripId) {
      commitMessages(() => []);
      setReady(false);
      return;
    }

    let cancelled = false;
    setReady(false);

    // Start fresh so messages from a previous trip never leak into this one.
    commitMessages(() => []);

    const unsubscribe = subscribeToTripChannel(tripId, {
      onMessage: (msg) => {
        if (cancelled) return;
        // Ignore own echoes that already replaced the optimistic bubble.
        commitMessages((prev) => mergeMessages(prev, msg));
      },
    });

    listTripMessages(tripId)
      .then((rows) => {
        if (cancelled) return;
        commitMessages((prev) => mergeHistory(prev, rows));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tripId, commitMessages]);

  const send = useCallback(
    async (text: string) => {
      const id = tripIdRef.current;
      const trimmed = text.trim();
      if (!trimmed || !id) return;

      const optimistic = createOptimisticMessage(id, senderRole, trimmed);
      commitMessages((prev) => [...prev, optimistic]);

      try {
        const row = await sendTripMessage(id, trimmed);
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

  return { messages, sendMessage: send, ready };
}
