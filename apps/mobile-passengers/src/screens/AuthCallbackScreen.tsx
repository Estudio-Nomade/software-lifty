import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getFriendlyAuthError } from '../lib/authErrors';
import { hasOAuthCallbackPayload, isAuthCallbackUrl } from '../lib/authUrlParams';
import { shouldTreatAuthCallbackAsSuccess } from '../lib/oauthSessionRecovery';
import { resolvePassengerPostAuthPathWithRetry } from '../lib/postAuthRouting';
import {
  afterPostOAuthHandoff,
  beginOAuthBrandBridge,
  endOAuthBrandBridge,
  endOAuthBrandBridgeAfterPaint,
  getLastOAuthHandoffTarget,
  isPostOAuthHandoffCompleted,
  runPostOAuthHandoff,
} from '../lib/postOAuthHandoff';
import { createSessionFromUrl } from '../lib/socialAuth';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

const AUTH_SCHEME = 'lifty-passenger';

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
    return `lifty-passenger://auth-callback?${q.toString()}`;
  }
  if (parts.code) {
    return `lifty-passenger://auth-callback?code=${encodeURIComponent(parts.code)}`;
  }
  if (parts.access_token && parts.refresh_token) {
    return `lifty-passenger://auth-callback#access_token=${encodeURIComponent(parts.access_token)}&refresh_token=${encodeURIComponent(parts.refresh_token)}`;
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
 * Absorbs `lifty-passenger://auth-callback` deep links on native APK.
 * BrandSplash is ONLY the root OAuthBrandBridge overlay — this screen stays plain
 * so twin-path never paints splash ×2.
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
    // Remount after handoff already done — leave once, no second splash.
    // Do NOT begin bridge here (would stick on early returns).
    if (isPostOAuthHandoffCompleted()) {
      const target = getLastOAuthHandoffTarget() ?? '/home';
      router.replace(
        target as '/complete-profile' | '/location-permissions' | '/home' | '/login-credentials',
      );
      endOAuthBrandBridgeAfterPaint();
      return;
    }

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
      // Stray remount without params — never light the overlay.
      return;
    } else {
      noParamsBootRef.current = true;
    }

    // Only after we commit to running exchange/handoff.
    beginOAuthBrandBridge();

    let cancelled = false;

    const navigateTo = (target: string) => {
      if (cancelled) return;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[AuthCallback] finishOk target=', target);
      }
      router.replace(
        target as '/complete-profile' | '/location-permissions' | '/home' | '/login-credentials',
      );
    };

    /**
     * Single post-OAuth handoff via module lock. Root OAuthBrandBridge holds the
     * one BrandSplash; this screen never paints its own.
     */
    const finishOk = async () => {
      if (cancelled || finishedOkRef.current) return;
      finishedOkRef.current = true;

      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (session?.access_token) {
          const metadata = session.user?.user_metadata as Record<string, unknown> | undefined;
          const full =
            (typeof metadata?.full_name === 'string' && metadata.full_name.trim()) ||
            (typeof metadata?.name === 'string' && metadata.name.trim()) ||
            [
              typeof metadata?.given_name === 'string' ? metadata.given_name.trim() : '',
              typeof metadata?.family_name === 'string' ? metadata.family_name.trim() : '',
            ]
              .filter(Boolean)
              .join(' ')
              .trim() ||
            null;
          useAuthStore
            .getState()
            .setSession(
              session.access_token,
              session.user?.id ?? null,
              session.user?.email ?? null,
              full,
            );
        }
        const userId = session?.user?.id ?? useAuthStore.getState().userId;

        const result = await runPostOAuthHandoff({
          key: userId ?? 'session',
          owner: 'AuthCallback',
          resolveTarget: async () => {
            let target = await resolvePassengerPostAuthPathWithRetry(userId ?? null);
            if (target === '/' && userId) {
              target = '/complete-profile';
            }
            if (target === '/' && !userId) {
              return '/login-credentials';
            }
            return target;
          },
          navigate: navigateTo,
        });

        if (cancelled) return;
        // joined → leader owns navigate+end; skipped → leave once if needed
        afterPostOAuthHandoff(result, (target) => navigateTo(target));
      } catch {
        if (cancelled) return;
        finishedOkRef.current = false;
        const userId = useAuthStore.getState().userId;
        const fallback = userId ? '/complete-profile' : '/login-credentials';
        try {
          const result = await runPostOAuthHandoff({
            key: userId ?? 'session',
            owner: 'AuthCallback',
            resolveTarget: async () => fallback,
            navigate: navigateTo,
          });
          if (!cancelled) afterPostOAuthHandoff(result, (target) => navigateTo(target));
        } catch {
          endOAuthBrandBridge();
        }
      }
    };

    const finishErr = async (err: unknown) => {
      if (cancelled || finishedOkRef.current) return;
      if (await shouldTreatAuthCallbackAsSuccess(() => supabase.auth.getSession())) {
        await finishOk();
        return;
      }
      await new Promise<void>((r) => setTimeout(r, 400));
      if (cancelled || finishedOkRef.current) return;
      if (await shouldTreatAuthCallbackAsSuccess(() => supabase.auth.getSession())) {
        await finishOk();
        return;
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const raw =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message ?? '')
            : String(err ?? '');
        console.error('[AuthCallback] finishErr', raw);
      }
      endOAuthBrandBridge();
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

  // Plain underlay — BrandSplash lives only on root OAuthBrandBridge (≤1).
  return <View style={styles.plainRoot} />;
}

const styles = StyleSheet.create({
  plainRoot: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
