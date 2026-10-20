import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// Finishes any pending web auth session when the app is re-focused.
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

// The deep link Supabase redirects back to after the provider approves.
// Uses the app scheme ("lifty") declared in app.json.
export const authRedirectUri = AuthSession.makeRedirectUri({
  scheme: 'lifty',
  path: 'auth-callback',
});

/**
 * Turns the deep-link URL returned by the browser into a Supabase session.
 * Handles both PKCE (`?code=...`) and implicit (`#access_token=...`) responses.
 */
async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
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

/**
 * Runs the full native OAuth dance for a provider:
 * 1. Ask Supabase for the provider authorize URL (without auto-redirecting).
 * 2. Open it in a secure in-app browser session bound to our deep link.
 * 3. Exchange the returned URL for a Supabase session.
 *
 * Returns the session on success, or `null` if the user dismissed the browser.
 */
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

  // 'cancel' | 'dismiss' — user closed the browser before finishing.
  return null;
}
