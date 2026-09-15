import { describe, expect, test } from 'bun:test';
import {
  IDENTIFICATION_PAUSE_DAYS,
  IDENTIFICATION_REMINDER_DAYS,
  evaluateIdentificationDeadline,
} from './identification-deadline';

describe('evaluateIdentificationDeadline', () => {
  const approvedAt = new Date('2026-01-01T12:00:00.000Z');

  test('constants: suspend at 30d, reminder before that', () => {
    expect(IDENTIFICATION_PAUSE_DAYS).toBe(30);
    expect(IDENTIFICATION_REMINDER_DAYS).toBe(20);
    expect(IDENTIFICATION_REMINDER_DAYS).toBeLessThan(IDENTIFICATION_PAUSE_DAYS);
  });

  test('issued never blocks', () => {
    const snap = evaluateIdentificationDeadline({
      identification_status: 'issued',
      approved_at: approvedAt,
      now: new Date('2026-06-01T12:00:00.000Z'),
    });
    expect(snap.phase).toBe('issued');
    expect(snap.blocks_online).toBe(false);
  });

  test('revoked always blocks', () => {
    const snap = evaluateIdentificationDeadline({
      identification_status: 'revoked',
      approved_at: approvedAt,
      now: new Date('2026-01-02T12:00:00.000Z'),
    });
    expect(snap.phase).toBe('revoked');
    expect(snap.blocks_online).toBe(true);
  });

  test('pending within grace is online OK', () => {
    const snap = evaluateIdentificationDeadline({
      identification_status: 'pending_pickup',
      approved_at: approvedAt,
      now: new Date('2026-01-10T12:00:00.000Z'),
    });
    expect(snap.phase).toBe('grace');
    expect(snap.blocks_online).toBe(false);
    expect(snap.show_reminder).toBe(true);
    expect(snap.days_since_approval).toBe(9);
    expect(snap.days_until_pause).toBe(IDENTIFICATION_PAUSE_DAYS - 9);
  });

  test('pending from reminder day is still online OK', () => {
    const snap = evaluateIdentificationDeadline({
      identification_status: 'pending_pickup',
      approved_at: approvedAt,
      now: new Date('2026-01-21T12:00:00.000Z'),
    });
    expect(snap.phase).toBe('reminder');
    expect(snap.blocks_online).toBe(false);
    expect(snap.days_since_approval).toBe(IDENTIFICATION_REMINDER_DAYS);
  });

  test('pending at day 30 suspends account (blocks online)', () => {
    const snap = evaluateIdentificationDeadline({
      identification_status: 'pending_pickup',
      approved_at: approvedAt,
      now: new Date('2026-01-31T12:00:00.000Z'),
    });
    expect(snap.phase).toBe('paused');
    expect(snap.blocks_online).toBe(true);
    expect(snap.days_since_approval).toBe(IDENTIFICATION_PAUSE_DAYS);
    expect(snap.days_until_pause).toBe(0);
  });

  test('falls back to admin_reviewed_at then created_at', () => {
    const snap = evaluateIdentificationDeadline({
      identification_status: 'pending_pickup',
      approved_at: null,
      admin_reviewed_at: approvedAt,
      now: new Date('2026-01-10T12:00:00.000Z'),
    });
    expect(snap.phase).toBe('grace');
    expect(snap.days_since_approval).toBe(9);
  });
});
