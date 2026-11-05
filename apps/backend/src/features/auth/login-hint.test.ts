import { describe, expect, test } from 'bun:test';
import {
  loginHintFromAuthUser,
  methodsFromAuthUser,
  normalizeLoginHintEmail,
} from './login-hint';

describe('login-hint mappers', () => {
  test('normalize trims + lowercases', () => {
    expect(normalizeLoginHintEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  test('google-only → googleOnly true', () => {
    expect(
      methodsFromAuthUser({
        identities: [{ provider: 'google' }],
        app_metadata: { providers: ['google'] },
      }),
    ).toEqual(['google']);
    expect(
      loginHintFromAuthUser({
        identities: [{ provider: 'google' }],
      }),
    ).toEqual({ googleOnly: true });
  });

  test('email-only → googleOnly false (same as missing)', () => {
    expect(
      loginHintFromAuthUser({
        identities: [{ provider: 'email' }],
      }),
    ).toEqual({ googleOnly: false });
  });

  test('both email + google → googleOnly false', () => {
    expect(
      loginHintFromAuthUser({
        identities: [{ provider: 'email' }, { provider: 'google' }],
      }),
    ).toEqual({ googleOnly: false });
  });

  test('null / missing user → googleOnly false (no existence leak)', () => {
    expect(loginHintFromAuthUser(null)).toEqual({ googleOnly: false });
    expect(loginHintFromAuthUser(undefined)).toEqual({ googleOnly: false });
  });

  test('unknown providers alone → googleOnly false', () => {
    expect(
      loginHintFromAuthUser({
        identities: [{ provider: 'apple' }],
      }),
    ).toEqual({ googleOnly: false });
  });
});
