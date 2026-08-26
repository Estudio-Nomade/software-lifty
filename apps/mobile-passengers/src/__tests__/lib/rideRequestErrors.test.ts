import { parseRideRequestError } from '../../lib/rideRequestErrors';

describe('parseRideRequestError', () => {
  it('maps PASSENGER_SUSPENDED', () => {
    const info = parseRideRequestError({
      response: {
        data: {
          error: {
            code: 'PASSENGER_SUSPENDED',
            message: 'Estás suspendido temporalmente por cancelaciones.',
          },
        },
      },
    });
    expect(info.code).toBe('PASSENGER_SUSPENDED');
    expect(info.title).toMatch(/suspendida/i);
    expect(info.showSupport).toBe(true);
  });

  it('maps DEBT_BLOCKED', () => {
    const info = parseRideRequestError({
      response: {
        data: {
          error: { code: 'DEBT_BLOCKED', message: 'Tenés $3000 de deuda' },
        },
      },
    });
    expect(info.code).toBe('DEBT_BLOCKED');
    expect(info.title).toMatch(/deuda/i);
  });

  it('falls back to UNKNOWN', () => {
    const info = parseRideRequestError(new Error('network down'));
    expect(info.code).toBe('UNKNOWN');
    expect(info.message).toBe('network down');
  });
});
