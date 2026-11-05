/**
 * Public login-hint payload.
 * Only discloses the one bit needed for UX: google-only (no password provider).
 * No `exists` field — missing user, email-password, and dual-method all look the same.
 */
export type LoginHintResult = { googleOnly: boolean };

type AuthIdentity = { provider?: string | null };
type AuthUserLike = {
  email?: string | null;
  identities?: AuthIdentity[] | null;
  app_metadata?: { providers?: string[] | null } | null;
};

export type LoginHintMethod = 'email' | 'google';

/** Map Supabase Auth user identities → email | google only. */
export function methodsFromAuthUser(user: AuthUserLike): LoginHintMethod[] {
  const methods = new Set<LoginHintMethod>();

  for (const id of user.identities ?? []) {
    const p = (id.provider ?? '').toLowerCase();
    if (p === 'email') methods.add('email');
    if (p === 'google') methods.add('google');
  }

  for (const raw of user.app_metadata?.providers ?? []) {
    const p = String(raw ?? '').toLowerCase();
    if (p === 'email') methods.add('email');
    if (p === 'google') methods.add('google');
  }

  return [...methods].sort() as LoginHintMethod[];
}

/**
 * true only when account has google and no email/password provider.
 * null/unknown/missing/email/dual → false (same public shape).
 */
export function loginHintFromAuthUser(user: AuthUserLike | null | undefined): LoginHintResult {
  if (!user) return { googleOnly: false };
  const methods = methodsFromAuthUser(user);
  const googleOnly = methods.includes('google') && !methods.includes('email');
  return { googleOnly };
}

export function normalizeLoginHintEmail(email: string): string {
  return email.trim().toLowerCase();
}
