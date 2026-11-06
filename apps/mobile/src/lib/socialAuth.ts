import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { getAuthQueryParams } from './authUrlParams';
import {
  beginOAuthAttempt,
  clearOAuthAttempt,
  markOAuthAttemptSession,
  releaseOAuthBlockedUser,
  resolveSessionAfterAuthError,
  resolveSessionAfterBrowserDismiss,
} from './oauthSessionRecovery';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Social providers supported by the native OAuth flow.
 *
 * Adding Apple later is intentionally a one-line change here (plus enabling the
 * provider in the Supabase dashboard). The AuthContext already exposes a generic
 * `signInWithProvider`, so no architectural change is needed:
 *   export type SocialProvider = 'google' | 'apple';
 */
export type SocialProvider = 'google';

export { getAuthQueryParams };

// The deep link Supabase redirects back to after the provider approves.
// Uses the app scheme ("lifty") declared in app.json.
export const authRedirectUri = AuthSession.makeRedirectUri({
  scheme: 'lifty',
  path: 'auth-callback',
});

/** Shared inflight so WebBrowser + deep-link twin paths await the same exchange. */
let inflightSessionFromUrl: {
  key: string;
  promise: Promise<Awaited<ReturnType<typeof runCreateSessionFromUrl>>>;
} | null = null;

function inflightKey(url: string): string {
  const { params, errorCode } = getAuthQueryParams(url);
  if (errorCode) return `err:${errorCode}`;
  if (params.code) return `code:${params.code}`;
  if (params.access_token) return `at:${params.access_token.slice(0, 24)}`;
  return url;
}

async function runCreateSessionFromUrl(url: string) {
  const { params, errorCode } = getAuthQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { code, access_token, refresh_token } = params;

  try {
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      markOAuthAttemptSession(data.session);
      return data.session;
    }

    if (access_token && refresh_token) {
      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) throw error;
      markOAuthAttemptSession(data.session);
      return data.session;
    }

    return null;
  } catch (e) {
    return resolveSessionAfterAuthError(e, () => supabase.auth.getSession());
  }
}

/** PKCE `?code=` or implicit `#access_token=` → Supabase session. Idempotent on twin paths. */
export async function createSessionFromUrl(url: string) {
  const key = inflightKey(url);
  if (inflightSessionFromUrl?.key === key) {
    return inflightSessionFromUrl.promise;
  }
  const promise = runCreateSessionFromUrl(url).finally(() => {
    if (inflightSessionFromUrl?.promise === promise) {
      inflightSessionFromUrl = null;
    }
  });
  inflightSessionFromUrl = { key, promise };
  return promise;
}

/**
 * Drop any leftover local Supabase session so dismiss/recovery cannot "succeed"
 * as a previous Google account on the same device.
 */
async function clearLocalSessionBeforeOAuth(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const blockedUserId = data.session?.user?.id ?? null;
  if (!data.session) return null;
  if (__DEV__) {
    console.log('[socialAuth] pre-OAuth local signOut', {
      blockedUserId,
      email: data.session.user?.email ?? null,
    });
  }
  await supabase.auth.signOut({ scope: 'local' });
  const after = await supabase.auth.getSession();
  if (after.data.session) {
    if (__DEV__) {
      console.log('[socialAuth] pre-OAuth session still present after signOut — retry');
    }
    await supabase.auth.signOut({ scope: 'local' });
  }
  return blockedUserId;
}

/**
 * Runs the full native OAuth dance for a provider:
 * 1. Ask Supabase for the provider authorize URL (without auto-redirecting).
 * 2. Open it in a secure in-app browser session bound to our deep link.
 * 3. Exchange the returned URL for a Supabase session.
 *
 * Returns the session on success, or `null` if the user dismissed the browser
 * and no twin-path session exists for this attempt.
 */
export async function signInWithProvider(provider: SocialProvider) {
  if (__DEV__) {
    console.log('[socialAuth] authRedirectUri', authRedirectUri);
  }

  const blockedUserId = await clearLocalSessionBeforeOAuth();
  const attemptId = beginOAuthAttempt(blockedUserId);

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: authRedirectUri,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('No se pudo iniciar el flujo de autenticacion.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, authRedirectUri);

    if (__DEV__) {
      const pathOnly =
        result.type === 'success' && result.url ? result.url.split('?')[0]?.split('#')[0] : null;
      console.log('[socialAuth] openAuthSession', {
        type: result.type,
        path: pathOnly,
        attemptId,
        blockedUserId,
      });
    }

    if (result.type === 'success' && result.url) {
      const session = await createSessionFromUrl(result.url);
      if (__DEV__) {
        console.log('[socialAuth] post-OAuth session', {
          attemptId,
          userId: session?.user?.id ?? null,
          email: session?.user?.email ?? null,
        });
      }
      if (!session) releaseOAuthBlockedUser();
      return session;
    }

    // Deep link may have completed exchange while browser reported dismiss.
    if (result.type === 'dismiss' || result.type === 'cancel') {
      if (inflightSessionFromUrl) {
        try {
          const twin = await inflightSessionFromUrl.promise;
          if (twin?.access_token) {
            if (__DEV__) {
              console.log('[socialAuth] dismiss recovered inflight', {
                attemptId,
                userId: twin.user?.id ?? null,
                email: twin.user?.email ?? null,
              });
            }
            return twin;
          }
        } catch {
          // fall through to attempt-scoped dismiss recovery
        }
      }
      const recovered = await resolveSessionAfterBrowserDismiss(() => supabase.auth.getSession());
      if (__DEV__) {
        console.log('[socialAuth] dismiss recovery', {
          attemptId,
          hit: Boolean(recovered),
          userId: recovered?.user?.id ?? null,
          email: recovered?.user?.email ?? null,
        });
      }
      if (!recovered) releaseOAuthBlockedUser();
      return recovered;
    }

    releaseOAuthBlockedUser();
    return null;
  } finally {
    // Drop attempt so a later stray AuthCallback finishErr cannot reuse mark.
    // blockedOAuthUserId stays until mark (success) or release (cancel above).
    clearOAuthAttempt();
  }
}
