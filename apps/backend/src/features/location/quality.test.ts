import { describe, expect, test } from 'bun:test';
import { evaluateFix } from './quality';

const now = 1_700_000_000_000;
const base = { lat: -31.9456, lng: -65.1895 };
const ctx = (over: Partial<Parameters<typeof evaluateFix>[1]> = {}) => ({
  onTrip: false,
  prev: null,
  now,
  ...over,
});

describe('evaluateFix', () => {
  test('rejects 0,0 and out-of-range', () => {
    for (const f of [
      { lat: 0, lng: 0 },
      { lat: 91, lng: 0.5 },
      { lat: 10, lng: 181 },
      { lat: Number.NaN, lng: 1 },
    ]) {
      expect(evaluateFix(f, ctx())).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  test('accuracy 25 ok on trip, 35 rejected on trip', () => {
    expect(evaluateFix({ ...base, accuracy: 25 }, ctx({ onTrip: true })).ok).toBe(true);
    expect(evaluateFix({ ...base, accuracy: 35 }, ctx({ onTrip: true }))).toEqual({
      ok: false,
      reason: 'low_accuracy',
    });
  });

  test('accuracy 45 ok online, 55 rejected online', () => {
    expect(evaluateFix({ ...base, accuracy: 45 }, ctx()).ok).toBe(true);
    expect(evaluateFix({ ...base, accuracy: 55 }, ctx()).ok).toBe(false);
  });

  test('accepts missing accuracy (rollout rule)', () => {
    expect(evaluateFix(base, ctx({ onTrip: true })).ok).toBe(true);
  });

  test('timestamp more than 10s off the server clock is untrusted: fixAt = now (slow phone clock is not locked out)', () => {
    for (const ts of [now - 30_000, now - 11_000, now + 11_000, now + 120_000]) {
      expect(evaluateFix({ ...base, timestamp: ts }, ctx())).toEqual({ ok: true, fixAt: now });
    }
  });

  test('timestamp within 10s of the server clock is kept', () => {
    expect(evaluateFix({ ...base, timestamp: now - 9_000 }, ctx())).toEqual({
      ok: true,
      fixAt: now - 9_000,
    });
  });

  test('rejects a fix older than the stored one (out of order)', () => {
    const prev = { ...base, fixAt: now - 1000 };
    expect(evaluateFix({ ...base, timestamp: now - 3000 }, ctx({ prev }))).toEqual({
      ok: false,
      reason: 'out_of_order',
    });
  });

  test('accepts a re-sent fix with the same timestamp as the stored one', () => {
    const prev = { ...base, fixAt: now - 1000 };
    expect(evaluateFix({ ...base, timestamp: now - 1000 }, ctx({ prev })).ok).toBe(true);
  });

  test('rejects a 500 m jump in 1 s', () => {
    const prev = { ...base, fixAt: now - 1000 };
    const far = { lat: base.lat + 0.0045, lng: base.lng }; // ~500 m
    expect(evaluateFix(far, ctx({ prev }))).toEqual({ ok: false, reason: 'jump' });
  });

  test('no previous fix never jumps', () => {
    expect(evaluateFix(base, ctx({ prev: null })).ok).toBe(true);
  });

  test('accepts ~15 m/s movement', () => {
    const prev = { ...base, fixAt: now - 1000 };
    const near = { lat: base.lat + 0.000135, lng: base.lng }; // ~15 m
    expect(evaluateFix(near, ctx({ prev })).ok).toBe(true);
  });
});
