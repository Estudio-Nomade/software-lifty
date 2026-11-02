import { parseFareEstimateError, parseRideRequestError } from '../../lib/rideRequestErrors';

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

  it('maps OUT_OF_PICKUP_AREA', () => {
    const info = parseRideRequestError({
      response: {
        status: 400,
        data: {
          error: {
            code: 'OUT_OF_PICKUP_AREA',
            message: 'No pedimos viajes desde esa zona. El origen debe estar cerca de Villa Dolores, Tandil.',
          },
        },
      },
    });
    expect(info.code).toBe('OUT_OF_PICKUP_AREA');
    expect(info.title).toMatch(/pickup/i);
    expect(info.message).toMatch(/Tandil/i);
  });

  it('falls back to UNKNOWN', () => {
    const info = parseRideRequestError(new Error('network down'));
    expect(info.code).toBe('UNKNOWN');
    expect(info.message).toBe('network down');
  });
});

describe('parseFareEstimateError', () => {
  it('maps OUT_OF_PICKUP_AREA with BE message', () => {
    const info = parseFareEstimateError({
      response: {
        status: 400,
        data: {
          error: {
            code: 'OUT_OF_PICKUP_AREA',
            message:
              'No pedimos viajes desde esa zona. El origen debe estar cerca de Villa Dolores, Tandil (núcleo de pickup).',
          },
        },
      },
    });
    expect(info.code).toBe('OUT_OF_PICKUP_AREA');
    expect(info.title).toMatch(/pickup/i);
    expect(info.message).toMatch(/Villa Dolores/i);
    expect(info.message).toMatch(/Tandil/i);
  });

  it('maps OUT_OF_DROPOFF_AREA with BE message', () => {
    const info = parseFareEstimateError({
      response: {
        status: 400,
        data: {
          error: {
            code: 'OUT_OF_DROPOFF_AREA',
            message: 'Destino fuera del alcance Lifty (~50 km desde Tandil).',
          },
        },
      },
    });
    expect(info.code).toBe('OUT_OF_DROPOFF_AREA');
    expect(info.title).toMatch(/destino/i);
    expect(info.message).toMatch(/Tandil/i);
  });

  it('uses generic tarifa copy for 5xx', () => {
    const info = parseFareEstimateError({
      response: { status: 500, data: { error: { code: 'INTERNAL', message: 'boom' } } },
    });
    expect(info.code).toBe('FARE_FAILED');
    expect(info.title).toMatch(/tarifa/i);
    expect(info.message).toMatch(/reintentá/i);
  });
});
