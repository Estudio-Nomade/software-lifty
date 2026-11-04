import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandSplash } from '../components/BrandSplash';
import { getFriendlyAuthError } from '../lib/authErrors';
import { hasOAuthCallbackPayload, isAuthCallbackUrl } from '../lib/authUrlParams';
import { shouldTreatAuthCallbackAsSuccess } from '../lib/oauthSessionRecovery';
import { resolvePostAuthRoute } from '../lib/postAuthRouting';
import { routePathForScreen } from '../lib/screenRoutes';
import { createSessionFromUrl } from '../lib/socialAuth';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

const AUTH_SCHEME = 'lifty';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildCallbackUrl(parts: {
  code?: string;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}): string | null {
  if (parts.error) {
    const q = new URLSearchParams();
    q.set('error', parts.error);
    if (parts.error_description) q.set('error_description', parts.error_description);
    return `lifty://auth-callback?${q.toString()}`;
  }
  if (parts.code) {
    return `lifty://auth-callback?code=${encodeURIComponent(parts.code)}`;
  }
  if (parts.access_token && parts.refresh_token) {
    return `lifty://auth-callback#access_token=${encodeURIComponent(parts.access_token)}&refresh_token=${encodeURIComponent(parts.refresh_token)}`;
  }
  return null;
}

function paramsAttemptKey(parts: {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  oauthError?: string;
}): string | null {
  const { code, accessToken, refreshToken, oauthError } = parts;
  if (!code && !accessToken && !oauthError) return null;
  return `p:${code ?? ''}|${accessToken ?? ''}|${refreshToken ?? ''}|${oauthError ?? ''}`;
}

/**
 * Absorbs `lifty://auth-callback` deep links on native APK.
 * Without this file, expo-router shows Unmatched Route + sitemap.
 * Session exchange is idempotent with openAuthSessionAsync (double entry OK).
 */
export function AuthCallbackScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    code?: string | string[];
    access_token?: string | string[];
    refresh_token?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const code = firstParam(routeParams.code);
  const accessToken = firstParam(routeParams.access_token);
  const refreshToken = firstParam(routeParams.refresh_token);
  const oauthError = firstParam(routeParams.error);
  const oauthErrorDescription = firstParam(routeParams.error_description);

  const startedKeysRef = useRef<Set<string>>(new Set());
  const noParamsBootRef = useRef(false);
  const finishedOkRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (finishedOkRef.current) return;

    const attemptKey = paramsAttemptKey({
      code,
      accessToken,
      refreshToken,
      oauthError,
    });

    if (attemptKey) {
      if (startedKeysRef.current.has(attemptKey)) return;
      startedKeysRef.current.add(attemptKey);
    } else if (noParamsBootRef.current) {
      return;
    } else {
      noParamsBootRef.current = true;
    }

    let cancelled = false;

    /**
     * Single post-OAuth handoff: resolve destination while BrandSplash stays up,
     * then one replace. Never hop via Welcome (that re-mounts BrandSplash + anim).
     * Transient status failure → `/` for Welcome recovery (auth + unresolved).
     */
    const finishOk = async () => {
      if (cancelled || finishedOkRef.current) return;
      // Claim before await so twin-path exchange cannot re-enter while status loads.
      finishedOkRef.current = true;
      let target = '/';
      try {
        // resolvePostAuthRoute only throws on transient network; other errors → onboarding.
        const route = await resolvePostAuthRoute();
        if (route.screen) {
          target = routePathForScreen(route.screen);
        }
      } catch {
        // Transient status fail → Welcome recovery (auth + unresolved status).
        target = '/';
      }
      if (cancelled) return;
      router.replace(target);
    };

    const finishErr = async (err: unknown) => {
      if (cancelled || finishedOkRef.current) return;
      if (await shouldTreatAuthCallbackAsSuccess(() => supabase.auth.getSession())) {
        await finishOk();
        return;
      }
      if (__DEV__) {
        const raw =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message ?? '')
            : String(err ?? '');
        console.error('[AuthCallback] finishErr', raw);
      }
      const msg = getFriendlyAuthError(err);
      setError(msg);
      setTimeout(() => {
        if (!cancelled && !finishedOkRef.current) {
          router.replace({
            pathname: '/login-credentials',
            params: { authError: msg },
          });
        }
      }, 900);
    };

    const exchange = async (url: string) => {
      const key = `url:${url}`;
      if (startedKeysRef.current.has(key) && finishedOkRef.current) return;
      startedKeysRef.current.add(key);
      await createSessionFromUrl(url);
      await finishOk();
    };

    const isCallbackPayload = (url: string) =>
      isAuthCallbackUrl(url, AUTH_SCHEME) && hasOAuthCallbackPayload(url);

    const run = async () => {
      try {
        const fromParams = buildCallbackUrl({
          code,
          access_token: accessToken,
          refresh_token: refreshToken,
          error: oauthError,
          error_description: oauthErrorDescription,
        });
        if (fromParams) {
          await exchange(fromParams);
          return;
        }

        const initial = await Linking.getInitialURL();
        if (initial && isCallbackPayload(initial)) {
          await exchange(initial);
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await finishOk();
          return;
        }

        // Twin path (openAuthSessionAsync) may still be exchanging — wait briefly.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1200);
        });
        if (cancelled || finishedOkRef.current) return;

        const again = await Linking.getInitialURL();
        if (again && isCallbackPayload(again)) {
          await exchange(again);
          return;
        }

        const session2 = await supabase.auth.getSession();
        if (session2.data.session) {
          await finishOk();
          return;
        }

        await finishErr(new Error('No se pudo completar el inicio de sesion con Google.'));
      } catch (e) {
        await finishErr(e);
      }
    };

    const sub = Linking.addEventListener('url', ({ url: eventUrl }) => {
      if (cancelled || finishedOkRef.current) return;
      if (!isCallbackPayload(eventUrl)) return;
      exchange(eventUrl).catch((e) => {
        void finishErr(e);
      });
    });

    run();

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router, code, accessToken, refreshToken, oauthError, oauthErrorDescription]);

  if (error) {
    return (
      <View style={styles.errorRoot}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.splashRoot}>
      <BrandSplash />
      <Text style={styles.splashHint}>Completando inicio de sesion…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  splashRoot: {
    flex: 1,
  },
  splashHint: {
    position: 'absolute',
    bottom: theme.spacing.xl * 2,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    textAlign: 'center',
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
  },
  errorRoot: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  errorText: {
    color: theme.colors.dangerRed,
    fontSize: theme.fontSize.md,
    textAlign: 'center',
  },
});
