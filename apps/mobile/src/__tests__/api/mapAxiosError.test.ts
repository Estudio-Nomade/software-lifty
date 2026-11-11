import { mapNetworkCodeToApiError, mapResponseDataToApiError } from '../../api/mapAxiosError';

describe('mapResponseDataToApiError', () => {
  it('keeps Lifty envelope untouched', () => {
    const body = {
      error: { code: 'NOT_FOUND', message: 'Nope', status: 404 },
      meta: { timestamp: '2026-01-01T00:00:00.000Z' },
    };
    expect(mapResponseDataToApiError(body, 404)).toEqual(body);
  });

  it('maps legacy auth string error to envelope (TOKEN_REQUIRED)', () => {
    const mapped = mapResponseDataToApiError(
      { error: 'Unauthorized', code: 'TOKEN_REQUIRED' },
      401,
    );
    expect(mapped.error.code).toBe('TOKEN_REQUIRED');
    expect(mapped.error.status).toBe(401);
    expect(mapped.error.message).toMatch(/sesión|sesion|Unauthorized/i);
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
  });

  it('does not claim server error for empty non-object body with 401', () => {
    const mapped = mapResponseDataToApiError(null, 401);
    expect(mapped.error.message).toBe('Error inesperado del servidor.');
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
});
