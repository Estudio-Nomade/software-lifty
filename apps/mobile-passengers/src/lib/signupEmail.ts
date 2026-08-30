import type { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js';

export type SignUpOutcome =
  | { kind: 'session'; session: Session }
  | { kind: 'needs_verify'; email: string; confirmationSent: boolean }
  | { kind: 'already_registered' };

/** Classify supabase.auth.signUp() data the same way as the driver app (#298). */
export function classifySignUpResult(
  data: { user: User | null; session: Session | null },
  email: string,
): SignUpOutcome {
  if (data.session) {
    return { kind: 'session', session: data.session };
  }
  if ((data.user?.identities?.length ?? 0) > 0) {
    return {
      kind: 'needs_verify',
      email,
      confirmationSent: Boolean(data.user?.confirmation_sent_at),
    };
  }
  return { kind: 'already_registered' };
}

/** Prefer signup OTP (register flow); fall back to email OTP (magic/login codes). */
export async function verifySignupEmailOtp(
  client: SupabaseClient,
  email: string,
  token: string,
): Promise<{ user: User | null; session: Session | null }> {
  const first = await client.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  });
  if (!first.error) return first.data;

  const second = await client.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (second.error) throw second.error;
  return second.data;
}

/** Resend the confirmation email for an unconfirmed signup (not magic-link login). */
export async function resendSignupEmailOtp(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

export function isAuthError(error: unknown): error is AuthError {
  return typeof error === 'object' && error !== null && 'message' in error;
}
