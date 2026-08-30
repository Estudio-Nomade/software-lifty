import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';

export function getWsUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  let base: string;

  if (envUrl) {
    base = envUrl.replace('/api', '').replace(/^http/, 'ws');
  } else {
    const port = process.env.EXPO_PUBLIC_API_PORT ?? '3001';

    // Same host resolution as getApiUrl(): web LAN must not fall back to
    // localhost of the client machine when hostUri is undefined.
    const pageHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
    if (pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1') {
      base = `ws://${pageHost}:${port}`;
    } else {
      const hostUri = Constants.expoConfig?.hostUri;
      const host = hostUri ? hostUri.split(':')[0] : 'localhost';
      const safeHost =
        host && !host.includes('ngrok') && !host.includes('exp.direct') ? host : 'localhost';
      base = `ws://${safeHost}:${port}`;
    }
  }

  const token = useAuthStore.getState().token;
  return `${base}/ws/location?token=${token ?? ''}`;
}
