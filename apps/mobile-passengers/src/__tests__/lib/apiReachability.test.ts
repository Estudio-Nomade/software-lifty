import {
  API_DOWN_TITLE,
  FARE_FAIL_TITLE,
  isApiUnreachable,
} from '../../lib/apiReachability';

describe('isApiUnreachable', () => {
  it('detects Railway Application not found 404', () => {
    expect(
      isApiUnreachable({
        response: {
          status: 404,
          data: { status: 'error', code: 404, message: 'Application not found' },
        },
      }),
    ).toBe(true);
  });

  it('detects ERR_NETWORK', () => {
    expect(isApiUnreachable({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(true);
  });

  it('detects 502/503 gateway', () => {
    expect(isApiUnreachable({ response: { status: 503, data: {} } })).toBe(true);
  });

  it('does not treat normal 404 business error as API down', () => {
    expect(
      isApiUnreachable({
        response: {
          status: 404,
          data: { error: { code: 'NOT_FOUND', message: 'Route not found' } },
        },
      }),
    ).toBe(false);
  });

  it('does not treat 500 fare matrix as API down', () => {
    expect(
      isApiUnreachable({
        response: {
          status: 500,
          data: { error: { message: 'OSRM failed' } },
        },
      }),
    ).toBe(false);
  });

  it('exports honest copy constants', () => {
    expect(API_DOWN_TITLE).toMatch(/servidor/i);
    expect(FARE_FAIL_TITLE).toMatch(/tarifa/i);
  });
});
