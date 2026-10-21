import {
  getAuthQueryParams,
  hasOAuthCallbackPayload,
  isAuthCallbackUrl,
} from '../../lib/authUrlParams';

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

  it('decodes percent-encoded values with embedded & and =', () => {
    const code = encodeURIComponent('a&b=c');
    const { params } = getAuthQueryParams(`lifty://auth-callback?code=${code}&state=ok`);
    expect(params.code).toBe('a&b=c');
    expect(params.state).toBe('ok');
  });

  it('does not throw on malformed percent-encoding', () => {
    const { params } = getAuthQueryParams('lifty://auth-callback?code=ab%ZZ&state=x');
    expect(params.code).toBe('ab%ZZ');
    expect(params.state).toBe('x');
  });

  it('parses query and hash together', () => {
    const { params } = getAuthQueryParams(
      'lifty://auth-callback?state=s#access_token=at&refresh_token=rt',
    );
    expect(params.state).toBe('s');
    expect(params.access_token).toBe('at');
    expect(params.refresh_token).toBe('rt');
  });
});

describe('isAuthCallbackUrl', () => {
  it('accepts lifty auth-callback deep links', () => {
    expect(isAuthCallbackUrl('lifty://auth-callback?code=x', 'lifty')).toBe(true);
    expect(isAuthCallbackUrl('lifty:///auth-callback?code=x', 'lifty')).toBe(true);
  });

  it('rejects other routes even with code=', () => {
    expect(isAuthCallbackUrl('lifty://reset-password?code=x', 'lifty')).toBe(false);
    expect(isAuthCallbackUrl('lifty-passenger://auth-callback?code=x', 'lifty')).toBe(false);
  });
});

describe('hasOAuthCallbackPayload', () => {
  it('detects oauth markers', () => {
    expect(hasOAuthCallbackPayload('lifty://auth-callback?code=1')).toBe(true);
    expect(hasOAuthCallbackPayload('lifty://auth-callback')).toBe(false);
  });
});
