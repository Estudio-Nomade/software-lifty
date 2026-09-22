import { getFriendlyAuthError } from '../../lib/authErrors';

describe('getFriendlyAuthError', () => {
  it('maps Invalid login credentials to wrong email/password, not OTP', () => {
    expect(getFriendlyAuthError(new Error('Invalid login credentials'))).toBe(
      'Email o contraseña incorrectos.',
    );
  });

  it('maps OTP token invalid/expired to OTP copy', () => {
    expect(
      getFriendlyAuthError(new Error('Token has expired or is invalid')),
    ).toBe('El codigo es invalido o expiro. Pedi uno nuevo.');
  });
});
