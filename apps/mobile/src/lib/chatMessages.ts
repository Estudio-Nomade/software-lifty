import type { TripMessage } from '../api/types';

const TEMP_ID_PREFIX = 'local-';

export function isTempMessageId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

/**
 * Runtime guard for broadcast payloads. The channel only listens to messages
 * published by the backend, but a defensive check keeps a malformed payload
 * from ever reaching the renderer.
 */
export function isTripMessage(value: unknown): value is TripMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.trip_id === 'string' &&
    typeof v.sender_id === 'string' &&
    (v.sender_role === 'driver' || v.sender_role === 'passenger') &&
    typeof v.text === 'string' &&
    typeof v.created_at === 'string'
  );
}

export function createOptimisticMessage(
  tripId: string,
  senderRole: TripMessage['sender_role'],
  text: string,
): TripMessage {
  return {
    id: `${TEMP_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trip_id: tripId,
    sender_id: 'me',
    sender_role: senderRole,
    text,
    created_at: new Date().toISOString(),
  };
}

/**
 * Adds an incoming message to the list without producing duplicates.
 *
 * A confirmed message can arrive twice (once from the POST response that
 * replaces the optimistic bubble, and once from the Supabase broadcast), so we
 * de-duplicate by real `id`. When the confirmation for a locally-optimistic
 * message arrives, we replace the oldest pending bubble that matches by text
 * and role, preserving its position in the list.
 */
export function mergeMessages(prev: TripMessage[], incoming: TripMessage): TripMessage[] {
  if (prev.some((m) => m.id === incoming.id)) return prev;

  const tempIndex = prev.findIndex(
    (m) =>
      isTempMessageId(m.id) && m.text === incoming.text && m.sender_role === incoming.sender_role,
  );

  if (tempIndex !== -1) {
    const next = [...prev];
    next[tempIndex] = incoming;
    return next;
  }

  return [...prev, incoming];
}

/**
 * Replaces a locally-optimistic message with its confirmed version from the
 * POST response. Unlike `mergeMessages`, it never appends: if the optimistic
 * bubble is already gone (e.g. the history refetch replaced the list after a
 * trip change) or the confirmation already arrived via the broadcast, the list
 * is returned unchanged to avoid duplicating or leaking a stale message.
 */
export function replaceOptimistic(
  prev: TripMessage[],
  tempId: string,
  confirmed: TripMessage,
): TripMessage[] {
  if (prev.some((m) => m.id === confirmed.id)) return prev;

  const index = prev.findIndex((m) => m.id === tempId);
  if (index === -1) return prev;

  const next = [...prev];
  next[index] = confirmed;
  return next;
}

/**
 * Merges the initial history snapshot into the current list without dropping
 * realtime messages that arrived while the fetch was in flight. Messages that
 * are already present are de-duplicated by id, pending optimistic bubbles are
 * reconciled with their persisted version, and the result is re-sorted by
 * creation time.
 */
export function mergeHistory(prev: TripMessage[], history: TripMessage[]): TripMessage[] {
  const merged = history.reduce((acc, m) => mergeMessages(acc, m), prev);
  return merged
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
