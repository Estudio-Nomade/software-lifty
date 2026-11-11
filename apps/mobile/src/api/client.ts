import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import type { z } from 'zod';
import {
  getCurrentOAuthAttempt,
  isOAuthLocalSignOutInFlight,
  resolveApiAccessToken,
} from '../lib/oauthSessionRecovery';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import {
  isAuthRefreshFailure,
  mapNetworkCodeToApiError,
  mapResponseDataToApiError,
  rejectErrorAfterRefreshFailure,
} from './mapAxiosError';
import { ApiError } from './types';

function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  // The backend may run on a non-default port (bun run setup picks a free
  // one and writes it here) — the host is still auto-detected from Expo.
  const port = process.env.EXPO_PUBLIC_API_PORT ?? '3001';

  // Web: hostUri is often undefined. Prefer the page hostname so opening
  // http://192.168.x.x:8081 hits the API on the same LAN machine (not localhost
  // of the client device).
  const pageHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
  if (pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1') {
    return `http://${pageHost}:${port}/api`;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && !host.includes('ngrok') && !host.includes('exp.direct'))
      return `http://${host}:${port}/api`;
  }

  return `http://localhost:${port}/api`;
}

const API_URL = getApiUrl();

if (__DEV__) {
  console.log('[API] Backend URL:', API_URL);
}

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export async function getValidated<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const response = await apiClient.get(url);
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'La respuesta del servidor no coincide con el formato esperado.',
        status: 500,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }
  return parsed.data;
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
};

type LiveSession = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

// Prefer store Bearer on the hot path. Only hit supabase.auth.getSession when the
// store has no token (lag after login) or an OAuth handoff is in flight (blocked
// pre-OAuth JWT must not win over a fresh live session).
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const store = useAuthStore.getState();
  let liveSession: LiveSession = null;
  const needsLiveSession = !store.token || !!getCurrentOAuthAttempt();
  if (needsLiveSession) {
    try {
      const { data } = await supabase.auth.getSession();
      liveSession = data.session;
    } catch {
      liveSession = null;
    }
  }

  const token = resolveApiAccessToken({
    storeToken: store.token,
    storeUserId: store.driverId,
    liveSession,
  });

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    if (token !== store.token && liveSession?.user?.id) {
      store.setSession(token, liveSession.user.id);
    }
  } else {
    config.headers.Authorization = undefined;
  }
  return config;
});

// A 401 from these endpoints is a definitive answer (bad credentials, dead
// session) — retrying with a refreshed access token makes no sense.
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/verify'];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const skipRefresh = NO_REFRESH_PATHS.some((path) => originalRequest?.url?.includes(path));

    if (error.response?.status === 401 && !originalRequest._retry && !skipRefresh) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        const newToken = data.session?.access_token ?? null;

        if (refreshError || !newToken) {
          throw refreshError ?? new Error('Refresh failed');
        }

        useAuthStore.getState().setSession(newToken, data.session?.user?.id ?? null);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshFailure: unknown) {
        const rejectWith = rejectErrorAfterRefreshFailure(refreshFailure, error, {
          apiUrl: API_URL,
          isDev: __DEV__,
        });
        processQueue(rejectWith, null);
        // Only wipe local session when refresh failed as auth death — not on
        // transient network/timeout during refreshSession.
        if (isAuthRefreshFailure(refreshFailure)) {
          if (getCurrentOAuthAttempt() || isOAuthLocalSignOutInFlight()) {
            useAuthStore.getState().clearAuthState();
          } else {
            useAuthStore.getState().clearAuth();
          }
        }
        return Promise.reject(rejectWith);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.data !== undefined && error.response?.data !== null) {
      return Promise.reject(
        new ApiError(
          mapResponseDataToApiError(error.response.data, error.response.status ?? 500, {
            apiUrl: API_URL,
            isDev: __DEV__,
          }),
        ),
      );
    }

    if (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ERR_TIMEOUT' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ERR_CANCELED'
    ) {
      return Promise.reject(
        new ApiError(
          mapNetworkCodeToApiError(error.code, {
            apiUrl: API_URL,
            isDev: __DEV__,
          }),
        ),
      );
    }

    return Promise.reject(error);
  },
);
