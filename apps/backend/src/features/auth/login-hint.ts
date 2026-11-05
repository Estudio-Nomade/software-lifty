/** Login methods exposed by POST /auth/login-hint (anti-enumeration soft). */
export type LoginHintMethod = 'email' | 'google';

export type LoginHintResult = { exists: false } | { exists: true; methods: LoginHintMethod[] };

type AuthIdentity = { provider?: string | null };
type AuthUserLike = {
  email?: string | null;
  identities?: AuthIdentity[] | null;
  app_metadata?: { providers?: string[] | null } | null;
};

const KNOWN: ReadonlySet<string> = new Set(['email', 'google']);

/** Map Supabase Auth user identities → public methods list (email | google only). */
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

export function loginHintFromAuthUser(user: AuthUserLike | null | undefined): LoginHintResult {
  if (!user) return { exists: false };
  const methods = methodsFromAuthUser(user).filter((m) => KNOWN.has(m));
  if (methods.length === 0) {
    // User row without readable providers — treat as exists with unknown methods
    // so client keeps generic credentials copy (no Google-only false positive).
    return { exists: true, methods: ['email'] };
  }
  return { exists: true, methods };
}

export function normalizeLoginHintEmail(email: string): string {
  return email.trim().toLowerCase();
}
