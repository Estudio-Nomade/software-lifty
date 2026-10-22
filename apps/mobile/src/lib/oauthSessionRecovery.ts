import type { Session } from '@supabase/supabase-js';

type GetSessionResult = {
  data: { session: Session | null };
};

/**
 * When PKCE exchange fails because the twin path (WebBrowser vs deep link)
 * already consumed the code, treat an existing session as success.
 */
export async function resolveSessionAfterAuthError(
  error: unknown,
  getSession: () => Promise<GetSessionResult>,
): Promise<Session> {
  const { data } = await getSession();
  if (data.session?.access_token) {
    return data.session;
  }
  throw error;
}

/** finishErr gate: do not bounce to login if session already exists. */
export async function shouldTreatAuthCallbackAsSuccess(
  getSession: () => Promise<GetSessionResult>,
): Promise<boolean> {
  const { data } = await getSession();
  return Boolean(data.session?.access_token);
}
