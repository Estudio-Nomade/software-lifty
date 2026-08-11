import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'google';

export const authRedirectUri = AuthSession.makeRedirectUri({
  scheme: 'lifty-passenger',
  path: 'auth-callback',
});

function getQueryParams(url: string): { params: Record<string, string>; errorCode: string | null } {
  const params: Record<string, string> = {};
  const match = url.match(/[?#](.*)/);
  if (!match) return { params, errorCode: null };

  const queryString = match[1];
  queryString.split('&').forEach((pair) => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
  });

  return { params, errorCode: params.error ?? null };
}

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = getQueryParams(url);
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

  if (result.type === 'success' && result.url) {
    return createSessionFromUrl(result.url);
  }

  return null;
}
