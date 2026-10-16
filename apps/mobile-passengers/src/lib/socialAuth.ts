import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { getAuthQueryParams } from './authUrlParams';
import { resolveSessionAfterAuthError } from './oauthSessionRecovery';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'google';

export { getAuthQueryParams };

export const authRedirectUri = AuthSession.makeRedirectUri({
  scheme: 'lifty-passenger',
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
      return data.session;
    }

    if (access_token && refresh_token) {
      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) throw error;
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

export async function signInWithProvider(provider: SocialProvider) {
  if (__DEV__) {
    console.log('[socialAuth] authRedirectUri', authRedirectUri);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: authRedirectUri,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No se pudo iniciar el flujo de autenticacion.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, authRedirectUri);

  if (__DEV__) {
    const pathOnly =
      result.type === 'success' && result.url ? result.url.split('?')[0]?.split('#')[0] : null;
    console.log('[socialAuth] openAuthSession', { type: result.type, path: pathOnly });
  }

  if (result.type === 'success' && result.url) {
    return createSessionFromUrl(result.url);
  }

  // Deep link may have completed exchange while browser reported dismiss.
  if (result.type === 'dismiss' || result.type === 'cancel') {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) return sessionData.session;
  }

  return null;
}
