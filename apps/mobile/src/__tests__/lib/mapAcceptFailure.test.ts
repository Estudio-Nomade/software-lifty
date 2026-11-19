import { ApiError } from '../../api/types';
import { mapAcceptFailure } from '../../lib/mapAcceptFailure';

function apiErr(code: string, message: string, status: number) {
  return new ApiError({
    error: { code, message, status },
    meta: { timestamp: new Date().toISOString() },
  });
}

describe('mapAcceptFailure', () => {
  it('maps OFFER_EXPIRED to expired terminal → Active', () => {
    const result = mapAcceptFailure(apiErr('OFFER_EXPIRED', 'La oferta de viaje ha expirado', 400), {
      offerStillAlive: true,
    });
    expect(result).toMatchObject({
      kind: 'expired',
      title: 'La solicitud expiró',
      body: 'Ya no podés aceptar este viaje.',
      terminalOffer: true,
      navigate: 'Active',
    });
    expect(result.body).not.toMatch(/Invalid|expired offer|Trip already/i);
  });

  it('maps CONFLICT / claimed to unavailable terminal → Active', () => {
    const result = mapAcceptFailure(
      apiErr('CONFLICT', 'Trip already claimed by another driver', 409),
      { offerStillAlive: true },
    );
    expect(result).toMatchObject({
      kind: 'unavailable',
      title: 'Este viaje ya no está disponible',
      body: 'La solicitud se reasignó o ya no está abierta.',
      terminalOffer: true,
      navigate: 'Active',
    });
    expect(result.body).not.toMatch(/Trip already claimed/i);
  });

  it('maps invalid transition BAD_REQUEST to unavailable', () => {
    const result = mapAcceptFailure(
      apiErr('BAD_REQUEST', 'Invalid transition from cancelled_early to accepted', 400),
      { offerStillAlive: false },
    );
    expect(result.kind).toBe('unavailable');
    expect(result.terminalOffer).toBe(true);
    expect(result.title).toBe('Este viaje ya no está disponible');
  });

  it('maps VEHICLE_TYPE_MISMATCH', () => {
    const result = mapAcceptFailure(
      apiErr('VEHICLE_TYPE_MISMATCH', 'Vehicle type does not match', 400),
      { offerStillAlive: true },
    );
    expect(result).toMatchObject({
      kind: 'vehicle_mismatch',
      title: 'Vehículo no coincide',
      terminalOffer: true,
      navigate: 'Active',
    });
  });

  it('maps TOKEN_REQUIRED / TOKEN_EXPIRED to session → Welcome', () => {
    expect(
      mapAcceptFailure(apiErr('TOKEN_REQUIRED', 'Token required', 401), {
        offerStillAlive: true,
      }),
    ).toMatchObject({
      kind: 'session',
      title: 'Sesión expirada',
      terminalOffer: true,
      navigate: 'Welcome',
    });
    expect(
      mapAcceptFailure(apiErr('TOKEN_EXPIRED', 'Token expired', 401), {
        offerStillAlive: true,
      }),
    ).toMatchObject({ kind: 'session', navigate: 'Welcome', terminalOffer: true });
  });

  it('maps network / 5xx to retryable when offer still alive', () => {
    const result = mapAcceptFailure(apiErr('NETWORK_ERROR', 'Network Error', 0), {
      offerStillAlive: true,
    });
    expect(result).toMatchObject({
      kind: 'retryable',
      title: 'No se pudo aceptar',
      terminalOffer: false,
      navigate: null,
    });
  });

  it('maps unknown with dead offer as terminal unavailable-ish', () => {
    const result = mapAcceptFailure(new Error('boom'), { offerStillAlive: false });
    expect(result.terminalOffer).toBe(true);
    expect(result.navigate).toBe('Active');
  });

  it('poll offer gone copy is Spanish unavailable', () => {
    const result = mapAcceptFailure.pollGone();
    expect(result).toMatchObject({
      kind: 'unavailable',
      title: 'Este viaje ya no está disponible',
      terminalOffer: true,
      navigate: 'Active',
    });
  });
});
