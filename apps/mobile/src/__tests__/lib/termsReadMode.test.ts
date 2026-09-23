import { isTermsReadMode } from '../../lib/termsReadMode';

describe('isTermsReadMode', () => {
  it('is read-mode from profile regardless of termsAccepted', () => {
    expect(isTermsReadMode({ from: 'profile', termsAccepted: false })).toBe(true);
    expect(isTermsReadMode({ from: 'profile', termsAccepted: true })).toBe(true);
  });

  it('is accept-mode after login (no from) when terms not yet accepted', () => {
    // Login always authenticates before navigating to Terms — never gate on isAuthenticated.
    expect(isTermsReadMode({ from: undefined, termsAccepted: false })).toBe(false);
    expect(isTermsReadMode({ from: '', termsAccepted: false })).toBe(false);
  });

  it('is read-mode when terms already accepted and not re-accepting', () => {
    expect(isTermsReadMode({ from: undefined, termsAccepted: true })).toBe(true);
  });

  it('ignores isAuthenticated-style signals (only from + termsAccepted)', () => {
    // Regression guard for PR #322: isAuthenticated alone must NOT imply read-mode.
    expect(
      isTermsReadMode({
        from: undefined,
        termsAccepted: false,
      }),
    ).toBe(false);
  });
});
