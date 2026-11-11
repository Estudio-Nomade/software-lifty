import {
  isAuthRefreshFailure,
  mapNetworkCodeToApiError,
  mapResponseDataToApiError,
  rejectErrorAfterRefreshFailure,
  userFacingApiMessage,
} from '../../api/mapAxiosError';

describe('mapResponseDataToApiError', () => {
  it('keeps Lifty envelope untouched for non-auth errors', () => {
    const body = {
      error: { code: 'NOT_FOUND', message: 'Nope', status: 404 },
      meta: { timestamp: '2026-01-01T00:00:00.000Z' },
    };
    expect(mapResponseDataToApiError(body, 404)).toEqual(body);
  });

  it('maps Lifty 401 envelope TOKEN_REQUIRED to Spanish session copy', () => {
    const mapped = mapResponseDataToApiError(
      {
        error: { code: 'TOKEN_REQUIRED', message: 'Se requiere iniciar sesión.', status: 401 },
        meta: { timestamp: '2026-01-01T00:00:00.000Z' },
      },
      401,
    );
    expect(mapped.error.code).toBe('TOKEN_REQUIRED');
    expect(mapped.error.status).toBe(401);
    expect(mapped.error.message).toMatch(/iniciar sesión/i);
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
  });

  it('maps legacy auth string error to envelope (TOKEN_REQUIRED)', () => {
    const mapped = mapResponseDataToApiError(
      { error: 'Unauthorized', code: 'TOKEN_REQUIRED' },
      401,
    );
    expect(mapped.error.code).toBe('TOKEN_REQUIRED');
    expect(mapped.error.status).toBe(401);
    expect(mapped.error.message).toMatch(/sesión|sesion/i);
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
    expect(mapped.meta.timestamp).toBeTruthy();
  });

  it('maps legacy TOKEN_EXPIRED body', () => {
    const mapped = mapResponseDataToApiError(
      {
        error: 'Unauthorized',
        code: 'TOKEN_EXPIRED',
        message: 'Token expired, please refresh',
      },
      401,
    );
    expect(mapped.error.code).toBe('TOKEN_EXPIRED');
    expect(mapped.error.message).toMatch(/expiró|sesión/i);
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
  });

  it('maps Lifty TOKEN_EXPIRED English message to Spanish session copy', () => {
    const mapped = mapResponseDataToApiError(
      {
        error: { code: 'TOKEN_EXPIRED', message: 'Token expired, please refresh', status: 401 },
        meta: { timestamp: '2026-01-01T00:00:00.000Z' },
      },
      401,
    );
    expect(mapped.error.code).toBe('TOKEN_EXPIRED');
    expect(mapped.error.message).toMatch(/expiró|sesión/i);
  });

  it('does not claim server error for empty non-object body with 401', () => {
    const mapped = mapResponseDataToApiError(null, 401);
    expect(mapped.error.code).toBe('TOKEN_REQUIRED');
    expect(mapped.error.status).toBe(401);
    expect(mapped.error.message).toMatch(/sesión|sesion/i);
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
  });

  it('does not claim server error for string body with 401', () => {
    const mapped = mapResponseDataToApiError('Unauthorized', 401);
    expect(mapped.error.code).toBe('TOKEN_REQUIRED');
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
  });

  it('maps status 0 non-object body as network, not server', () => {
    const mapped = mapResponseDataToApiError(undefined, 0, {
      isDev: true,
      apiUrl: 'https://api.liftyviajes.com/api',
    });
    expect(mapped.error.code).toBe('NETWORK_ERROR');
    expect(mapped.error.status).toBe(0);
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
    expect(mapped.error.message).toContain('https://api.liftyviajes.com/api');
  });

  it('still uses INTERNAL_ERROR for opaque 500 non-object body', () => {
    const mapped = mapResponseDataToApiError(null, 500);
    expect(mapped.error.code).toBe('INTERNAL_ERROR');
    expect(mapped.error.message).toMatch(/inesperado del servidor/i);
  });
});

describe('mapNetworkCodeToApiError', () => {
  it('maps ERR_NETWORK without calling it server error', () => {
    const mapped = mapNetworkCodeToApiError('ERR_NETWORK', {
      isDev: true,
      apiUrl: 'http://192.168.1.7:3001/api',
    });
    expect(mapped.error.code).toBe('NETWORK_ERROR');
    expect(mapped.error.status).toBe(0);
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
    expect(mapped.error.message).toContain('http://192.168.1.7:3001/api');
  });

  it('maps ERR_TIMEOUT without calling it server error', () => {
    const mapped = mapNetworkCodeToApiError('ERR_TIMEOUT');
    expect(mapped.error.code).toBe('TIMEOUT_ERROR');
    expect(mapped.error.status).toBe(0);
    expect(mapped.error.message).toMatch(/espera|timeout|responde/i);
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
  });

  it('maps axios ECONNABORTED timeout like ERR_TIMEOUT', () => {
    const mapped = mapNetworkCodeToApiError('ECONNABORTED');
    expect(mapped.error.code).toBe('TIMEOUT_ERROR');
    expect(mapped.error.message).not.toMatch(/inesperado del servidor/i);
  });
});

describe('userFacingApiMessage', () => {
  it('never paints opaque server error on save context', () => {
    const err = { code: 'INTERNAL_ERROR', message: 'Error inesperado del servidor.', status: 500 };
    expect(userFacingApiMessage(err, { context: 'save' })).not.toMatch(/inesperado del servidor/i);
    expect(userFacingApiMessage(err, { context: 'save' })).toMatch(/guardar|conexión|conexion/i);
  });

  it('maps TOKEN_REQUIRED to session copy', () => {
    const err = { code: 'TOKEN_REQUIRED', message: 'Unauthorized', status: 401 };
    expect(userFacingApiMessage(err)).toMatch(/iniciar sesión/i);
  });

  it('keeps ADDRESS_UNRESOLVABLE backend copy', () => {
    const err = {
      code: 'ADDRESS_UNRESOLVABLE',
      message: 'No pudimos ubicar ese domicilio. Probá con calle, altura y localidad.',
      status: 400,
    };
    expect(userFacingApiMessage(err, { context: 'save' })).toContain('domicilio');
  });

  it('maps location INTERNAL_ERROR to GPS fallback', () => {
    const err = { code: 'INTERNAL_ERROR', message: 'Error inesperado del servidor.', status: 500 };
    expect(userFacingApiMessage(err, { context: 'location' })).toMatch(/GPS|ubicación|ubicacion/i);
  });

  it('maps places context fallback without claiming calles on opaque server', () => {
    const err = { code: 'INTERNAL_ERROR', message: 'Error inesperado del servidor.', status: 500 };
    expect(userFacingApiMessage(err, { context: 'places' })).toMatch(
      /calles|lugares|ubicación|ubicacion/i,
    );
    expect(userFacingApiMessage(err, { context: 'places' })).not.toMatch(/inesperado del servidor/i);
  });

  it('maps places 401 to session, never calles search copy', () => {
    const err = { code: 'TOKEN_REQUIRED', message: 'Se requiere iniciar sesión.', status: 401 };
    const msg = userFacingApiMessage(err, { context: 'places' });
    expect(msg).toMatch(/iniciar sesión|iniciar sesion/i);
    expect(msg).not.toMatch(/calles ni lugares/i);
  });
});

describe('isAuthRefreshFailure / rejectErrorAfterRefreshFailure', () => {
  const original401 = {
    response: {
      status: 401,
      data: {
        error: { code: 'TOKEN_REQUIRED', message: 'Se requiere iniciar sesión.', status: 401 },
        meta: { timestamp: '2026-01-01T00:00:00.000Z' },
      },
    },
  };

  it('treats missing refresh token as auth death', () => {
    expect(isAuthRefreshFailure({ message: 'Invalid Refresh Token', status: 400 })).toBe(true);
    expect(isAuthRefreshFailure(new Error('Refresh failed'))).toBe(true);
  });

  it('treats network/timeout refresh failures as transport', () => {
    expect(isAuthRefreshFailure({ message: 'Failed to fetch' })).toBe(false);
    expect(isAuthRefreshFailure({ code: 'ERR_NETWORK' })).toBe(false);
    expect(isAuthRefreshFailure({ code: 'ECONNABORTED', message: 'timeout' })).toBe(false);
  });

  it('maps auth refresh death once to session ApiError (not opaque server)', () => {
    const mapped = rejectErrorAfterRefreshFailure(
      { message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
      original401,
      { apiUrl: 'https://api.liftyviajes.com/api', isDev: false },
    );
    expect(mapped.status).toBe(401);
    expect(mapped.code).toMatch(/TOKEN_/);
    expect(mapped.message).not.toMatch(/inesperado del servidor/i);
  });

  it('preserves transport nature when refreshSession fails on network', () => {
    const mapped = rejectErrorAfterRefreshFailure(
      { message: 'Failed to fetch', name: 'AuthRetryableFetchError' },
      original401,
      { apiUrl: 'https://api.liftyviajes.com/api', isDev: true },
    );
    expect(mapped.status).toBe(0);
    expect(mapped.code).toBe('NETWORK_ERROR');
    expect(mapped.message).not.toMatch(/iniciar sesión/i);
    expect(mapped.message).not.toMatch(/inesperado del servidor/i);
  });
});
