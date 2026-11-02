import {
  buildTripCancelledParams,
  isCancelledTripStatus,
  resolveActiveGoneAction,
} from '../../lib/cancellation';

describe('isCancelledTripStatus', () => {
  test.each(['cancelled', 'cancelled_early', 'cancelled_late'] as const)(
    'true for %s',
    (status) => {
      expect(isCancelledTripStatus(status)).toBe(true);
    },
  );

  test.each(['offered', 'en_route', 'waiting', 'completed', 'expired', null, undefined, ''])(
    'false for %s',
    (status) => {
      expect(isCancelledTripStatus(status)).toBe(false);
    },
  );
});

describe('buildTripCancelledParams', () => {
  test('defaults cancel_reason to user_cancel', () => {
    expect(buildTripCancelledParams(null).cancel_reason).toBe('user_cancel');
  });

  test('maps id to trip_id', () => {
    expect(buildTripCancelledParams({ id: 't1' }).trip_id).toBe('t1');
  });
});

describe('resolveActiveGoneAction', () => {
  test('trip_cancelled when detail is cancelled by passenger', () => {
    const result = resolveActiveGoneAction({
      id: 'trip-1',
      status: 'cancelled_early',
      cancel_reason: 'user_cancel',
      cancel_actor: 'passenger',
      counts_for_tvf: false,
      credit_driver: false,
      fee_applied: 0,
    });
    expect(result).toEqual({
      action: 'trip_cancelled',
      params: expect.objectContaining({
        trip_id: 'trip-1',
        cancel_reason: 'user_cancel',
        cancel_actor: 'passenger',
      }),
    });
  });

  test('dismiss when detail missing (expired / reassigned / 404)', () => {
    expect(resolveActiveGoneAction(null)).toEqual({ action: 'dismiss' });
    expect(resolveActiveGoneAction(undefined)).toEqual({ action: 'dismiss' });
  });

  test('dismiss when detail is not a cancelled terminal status', () => {
    expect(resolveActiveGoneAction({ id: 't1', status: 'expired' })).toEqual({
      action: 'dismiss',
    });
    expect(resolveActiveGoneAction({ id: 't1', status: 'offered' })).toEqual({
      action: 'dismiss',
    });
  });
});
