import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import type { z } from 'zod';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { ApiError, apiErrorSchema } from './types';

function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  // The backend may run on a non-default port (bun run setup picks a free
  // one and writes it here) — the host is still auto-detected from Expo.
  const port = process.env.EXPO_PUBLIC_API_PORT ?? '3000';

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && !host.includes('ngrok')) return `http://${host}:${port}/api`;
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

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.data) {
      const parsed = apiErrorSchema.safeParse(error.response.data);
      if (parsed.success) {
        return Promise.reject(new ApiError(parsed.data));
      }
      return Promise.reject(
        new ApiError({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Error inesperado del servidor.',
            status: error.response.status,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      );
    }

    if (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ERR_TIMEOUT' ||
      error.code === 'ERR_CANCELED'
    ) {
      const errorMap: Record<string, string> = {
        ERR_NETWORK: 'Sin conexion. Verifica que el backend este corriendo y tu internet funcione.',
        ERR_TIMEOUT: 'Tiempo de espera agotado. El servidor no responde.',
        ERR_CANCELED: 'Solicitud cancelada.',
      };
      return Promise.reject(
        new ApiError({
          error: {
            code: 'NETWORK_ERROR',
            message: errorMap[error.code] ?? 'Sin conexion. Verifica tu internet.',
            status: 0,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      );
    }

    return Promise.reject(error);
  },
);
