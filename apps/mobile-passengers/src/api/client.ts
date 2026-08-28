import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  const port = process.env.EXPO_PUBLIC_API_PORT ?? '3001';

  // On web, `Constants.expoConfig?.hostUri` is undefined, so we used to fall
  // back to `localhost` — which is wrong when the app is opened via LAN IP
  // (e.g. `http://192.168.x.x:8083` from another device or the QR flow). Use
  // the page's own hostname so the API resolves to the same machine the
  // browser loaded the bundle from.
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

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/verify'];

api.interceptors.response.use(
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
              resolve(api(originalRequest));
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
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export { api };
