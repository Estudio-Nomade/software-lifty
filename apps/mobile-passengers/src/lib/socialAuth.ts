import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { getAuthQueryParams } from './authUrlParams';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'google';

export { getAuthQueryParams };

export const authRedirectUri = AuthSession.makeRedirectUri({
  scheme: 'lifty-passenger',
  path: 'auth-callback',
});

/** PKCE `?code=` or implicit `#access_token=` → Supabase session. Idempotent if already signed in. */
export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = getAuthQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { code, access_token, refresh_token } = params;

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

  return null;
}
