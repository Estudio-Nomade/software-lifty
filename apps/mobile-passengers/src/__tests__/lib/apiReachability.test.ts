import { isApiUnreachable } from '../../lib/apiReachability';

describe('isApiUnreachable', () => {
  it('detects ERR_NETWORK', () => {
    expect(isApiUnreachable({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(true);
  });

  it('detects Railway Application not found 404', () => {
    expect(
      isApiUnreachable({
        response: { status: 404, data: { message: 'Application not found' } },
      }),
    ).toBe(true);
  });

  it('does not treat OUT_OF_PICKUP_AREA 400 as unreachable', () => {
    expect(
      isApiUnreachable({
        response: {
          status: 400,
          data: {
            error: { code: 'OUT_OF_PICKUP_AREA', message: 'No pedimos viajes desde esa zona.' },
          },
        },
      }),
    ).toBe(false);
  });
});
