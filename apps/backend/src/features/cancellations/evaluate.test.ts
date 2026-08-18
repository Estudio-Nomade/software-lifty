process.env.NODE_ENV = 'test';
import { describe, expect, test } from 'bun:test';
import { DEFAULT_CANCELLATION_CONFIG } from './config';
import { evaluateCancel } from './evaluate';

const cfg = DEFAULT_CANCELLATION_CONFIG;
const t0 = new Date('2026-08-18T12:00:00.000Z');

function input(over: Partial<Parameters<typeof evaluateCancel>[0]>) {
  return {
    status: 'pending',
    actor: 'passenger' as const,
    reason: 'user_cancel' as const,
    now: t0,
    createdAt: t0,
    assignedAt: null,
    waitingSince: null,
    config: cfg,
    ...over,
  };
}

describe('evaluateCancel', () => {
  test('passenger pending → fee 0', () => {
    const d = evaluateCancel(input({ status: 'pending' }));
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(0);
    expect(d.reason).toBe('user_cancel');
    expect(d.stage).toBe('pre_asignacion');
    expect(d.countsForTvf).toBe(false);
  });

  test('system pending before timeout → cannot', () => {
    const d = evaluateCancel(input({ actor: 'system', reason: 'auto_timeout', status: 'pending' }));
    expect(d.canCancel).toBe(false);
    expect(d.code).toBe('CANCEL_NOT_ALLOWED');
  });

  test('system pending at 300s → auto_timeout fee 0', () => {
    const d = evaluateCancel(
      input({
        actor: 'system',
        reason: 'auto_timeout',
        status: 'offered',
        now: new Date(t0.getTime() + 300_000),
      }),
    );
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(0);
    expect(d.reason).toBe('auto_timeout');
  });

  test('passenger accepted at 119s → fee 0', () => {
    const d = evaluateCancel(
      input({
        status: 'accepted',
        assignedAt: t0,
        now: new Date(t0.getTime() + 119_000),
      }),
    );
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(0);
    expect(d.stage).toBe('en_camino');
  });

  test('passenger accepted at 121s → fee 600 credit driver', () => {
    const d = evaluateCancel(
      input({
        status: 'accepted',
        assignedAt: t0,
        now: new Date(t0.getTime() + 121_000),
      }),
    );
    expect(d.feeArs).toBe(600);
    expect(d.creditDriver).toBe(true);
    expect(d.countsForTvf).toBe(false);
  });

  test('driver accepted → fee 0 counts for TVF', () => {
    const d = evaluateCancel(
      input({ status: 'accepted', actor: 'driver', reason: 'driver_cancel', assignedAt: t0 }),
    );
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(0);
    expect(d.countsForTvf).toBe(true);
  });

  test('passenger waiting → fee 600', () => {
    const d = evaluateCancel(input({ status: 'waiting', waitingSince: t0 }));
    expect(d.feeArs).toBe(600);
    expect(d.stage).toBe('llegado');
  });

  test('driver no-show at 299s → NO_SHOW_TOO_EARLY', () => {
    const d = evaluateCancel(
      input({
        status: 'waiting',
        actor: 'driver',
        reason: 'no_show',
        waitingSince: t0,
        now: new Date(t0.getTime() + 299_000),
      }),
    );
    expect(d.canCancel).toBe(false);
    expect(d.code).toBe('NO_SHOW_TOO_EARLY');
  });

  test('driver no-show at 301s → fee 600 not TVF', () => {
    const d = evaluateCancel(
      input({
        status: 'waiting',
        actor: 'driver',
        reason: 'no_show',
        waitingSince: t0,
        now: new Date(t0.getTime() + 301_000),
      }),
    );
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(600);
    expect(d.creditDriver).toBe(true);
    expect(d.countsForTvf).toBe(false);
    expect(d.reason).toBe('no_show');
  });

  test('in_trip → CANCEL_NOT_ALLOWED', () => {
    const d = evaluateCancel(input({ status: 'in_trip' }));
    expect(d.canCancel).toBe(false);
    expect(d.code).toBe('CANCEL_NOT_ALLOWED');
  });
});
