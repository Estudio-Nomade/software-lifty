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

  test('google-only identities → methods google', () => {
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
    ).toEqual({ exists: true, methods: ['google'] });
  });

  test('email-only → methods email', () => {
    expect(
      loginHintFromAuthUser({
        identities: [{ provider: 'email' }],
      }),
    ).toEqual({ exists: true, methods: ['email'] });
  });

  test('both email + google', () => {
    expect(
      loginHintFromAuthUser({
        identities: [{ provider: 'email' }, { provider: 'google' }],
      }),
    ).toEqual({ exists: true, methods: ['email', 'google'] });
  });

  test('null user → exists false', () => {
    expect(loginHintFromAuthUser(null)).toEqual({ exists: false });
    expect(loginHintFromAuthUser(undefined)).toEqual({ exists: false });
  });

  test('unknown providers alone → soft email (generic credentials UX)', () => {
    expect(
      loginHintFromAuthUser({
        identities: [{ provider: 'apple' }],
      }),
    ).toEqual({ exists: true, methods: ['email'] });
  });
});
