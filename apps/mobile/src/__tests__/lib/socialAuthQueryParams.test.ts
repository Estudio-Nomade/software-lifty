import { getAuthQueryParams } from '../../lib/authUrlParams';

describe('getAuthQueryParams', () => {
  it('parses PKCE code from query', () => {
    const { params, errorCode } = getAuthQueryParams('lifty://auth-callback?code=abc123&state=x');
    expect(errorCode).toBeNull();
    expect(params.code).toBe('abc123');
  });

  it('parses tokens from hash', () => {
    const { params } = getAuthQueryParams(
      'lifty://auth-callback#access_token=at&refresh_token=rt',
    );
    expect(params.access_token).toBe('at');
    expect(params.refresh_token).toBe('rt');
  });

  it('surfaces provider error', () => {
    const { errorCode } = getAuthQueryParams('lifty://auth-callback?error=access_denied');
    expect(errorCode).toBe('access_denied');
  });
});
