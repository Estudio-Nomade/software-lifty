import { mapNetworkCodeToApiError, mapResponseDataToApiError, userFacingApiMessage } from '../../api/mapAxiosError';

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
});
