import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';

export function getWsUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  let base: string;

  if (envUrl) {
    base = envUrl.replace('/api', '').replace(/^http/, 'ws');
  } else {
    const port = process.env.EXPO_PUBLIC_API_PORT ?? '3000';
    const hostUri = Constants.expoConfig?.hostUri;
    const host = hostUri ? hostUri.split(':')[0] : 'localhost';
    base = `ws://${host}:${port}`;
  }

  const token = useAuthStore.getState().token;
  return `${base}/ws/location?token=${token ?? ''}`;
}
