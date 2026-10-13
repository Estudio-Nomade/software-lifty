import {
  LEGAL_SITE_ORIGIN,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from '../../legal/legalUrls';

describe('legalUrls', () => {
  test('canonical host is web.liftyviajes.com', () => {
    expect(LEGAL_SITE_ORIGIN).toBe('https://web.liftyviajes.com');
    expect(PRIVACY_POLICY_URL).toBe('https://web.liftyviajes.com/privacidad');
    expect(TERMS_URL).toBe('https://web.liftyviajes.com/terminos');
  });
});
