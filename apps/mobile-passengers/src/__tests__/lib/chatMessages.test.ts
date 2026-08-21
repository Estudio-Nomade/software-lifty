import type { TripMessage } from '../../api/types';
import {
  createOptimisticMessage,
  isTempMessageId,
  isTripMessage,
  mergeHistory,
  mergeMessages,
  replaceOptimistic,
} from '../../lib/chatMessages';

const msg = (overrides: Partial<TripMessage> = {}): TripMessage => ({
  id: 'real-1',
  trip_id: 'trip-1',
  sender_id: 'user-1',
  sender_role: 'driver',
  text: 'hola',
  created_at: '2026-08-21T00:00:00.000Z',
  ...overrides,
});

describe('mergeMessages', () => {
  test('appends a new incoming message', () => {
    const incoming = msg({ id: 'real-2', text: 'mundo' });
    const result = mergeMessages([msg()], incoming);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(incoming);
  });

  test('does not duplicate an already-confirmed id', () => {
    const existing = msg();
    expect(mergeMessages([existing], existing)).toEqual([existing]);
  });

  test('replaces the oldest optimistic message matching text and role', () => {
    const optimistic = msg({ id: 'local-1', sender_id: 'me', text: 'hola', sender_role: 'driver' });
    const confirmed = msg({ id: 'real-1', text: 'hola', sender_role: 'driver' });
    const result = mergeMessages([optimistic], confirmed);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('real-1');
  });

  test('does not match an optimistic message from the other role', () => {
    const optimistic = msg({ id: 'local-1', sender_id: 'me', text: 'hola', sender_role: 'driver' });
    const incoming = msg({ id: 'real-2', text: 'hola', sender_role: 'passenger' });
    const result = mergeMessages([optimistic], incoming);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('local-1');
    expect(result[1].id).toBe('real-2');
  });
});

describe('replaceOptimistic', () => {
  test('replaces the optimistic bubble with the confirmed message', () => {
    const optimistic = msg({ id: 'local-1', sender_id: 'me' });
    const confirmed = msg({ id: 'real-1' });
    const result = replaceOptimistic([optimistic], 'local-1', confirmed);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('real-1');
  });

  test('does nothing when the confirmed id is already present', () => {
    const confirmed = msg({ id: 'real-1' });
    const prev = [confirmed];
    expect(replaceOptimistic(prev, 'local-1', confirmed)).toEqual(prev);
  });

  test('does not append when the optimistic bubble is gone', () => {
    const prev = [msg({ id: 'real-other', text: 'otro' })];
    const confirmed = msg({ id: 'real-1', text: 'hola' });
    expect(replaceOptimistic(prev, 'local-missing', confirmed)).toEqual(prev);
  });
});

describe('createOptimisticMessage', () => {
  test('generates a temp id and sender placeholder', () => {
    const optimistic = createOptimisticMessage('trip-1', 'driver', 'hola');
    expect(isTempMessageId(optimistic.id)).toBe(true);
    expect(optimistic.sender_id).toBe('me');
    expect(optimistic.text).toBe('hola');
    expect(optimistic.sender_role).toBe('driver');
  });
});

describe('isTripMessage', () => {
  test('accepts a valid message', () => {
    expect(isTripMessage(msg())).toBe(true);
  });

  test('rejects null, primitives and malformed payloads', () => {
    expect(isTripMessage(null)).toBe(false);
    expect(isTripMessage('hola')).toBe(false);
    expect(isTripMessage({})).toBe(false);
    expect(
      isTripMessage({
        id: '1',
        trip_id: 't',
        sender_id: 'u',
        sender_role: 'admin',
        text: 'x',
        created_at: '2026-08-21T00:00:00.000Z',
      }),
    ).toBe(false);
    expect(isTripMessage({ id: '1', text: 'hola' })).toBe(false);
  });
});

describe('mergeHistory', () => {
  test('keeps realtime messages that arrived while the fetch was in flight', () => {
    const realtime = msg({ id: 'rt-1', text: 'realtime', created_at: '2026-08-21T00:00:03.000Z' });
    const history = [
      msg({ id: 'h-1', text: 'old1', created_at: '2026-08-21T00:00:01.000Z' }),
      msg({ id: 'h-2', text: 'old2', created_at: '2026-08-21T00:00:02.000Z' }),
    ];
    const result = mergeHistory([realtime], history);
    expect(result.map((m) => m.id)).toEqual(['h-1', 'h-2', 'rt-1']);
  });

  test('reconciles a pending optimistic bubble with its persisted version', () => {
    const optimistic = msg({
      id: 'local-1',
      sender_id: 'me',
      text: 'hola',
      created_at: '2026-08-21T00:00:05.000Z',
    });
    const history = [
      msg({ id: 'h-1', text: 'hola', sender_role: 'driver', created_at: '2026-08-21T00:00:04.000Z' }),
    ];
    const result = mergeHistory([optimistic], history);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('h-1');
  });
});
