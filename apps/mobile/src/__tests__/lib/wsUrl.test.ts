import { getWsUrl } from '../../lib/wsUrl';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: 'tok' }) },
}));

describe('getWsUrl', () => {
  const original = process.env.EXPO_PUBLIC_API_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = original;
  });

  test('strips only the trailing /api, not the api. subdomain', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.liftyviajes.com/api';
    expect(getWsUrl()).toBe('wss://api.liftyviajes.com/ws/location?token=tok');
  });

  test('works for a LAN http url', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.5:3001/api';
    expect(getWsUrl()).toBe('ws://192.168.1.5:3001/ws/location?token=tok');
  });
});
