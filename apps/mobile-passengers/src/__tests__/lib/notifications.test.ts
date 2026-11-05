const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();
const mockAddPushTokenListener = jest.fn();

jest.mock('expo', () => ({ isRunningInExpoGo: () => false }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'pid' } }, slug: 'lifty-passenger' } },
}));
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPermissionsAsync(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetExpoPushTokenAsync(...a),
  setNotificationChannelAsync: (...a: unknown[]) => mockSetNotificationChannelAsync(...a),
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  addPushTokenListener: (...a: unknown[]) => mockAddPushTokenListener(...a),
}));
jest.mock('../../api/client', () => ({
  api: {
    post: (...a: unknown[]) => mockApiPost(...a),
    delete: (...a: unknown[]) => mockApiDelete(...a),
  },
}));

import { Platform } from 'react-native';
import {
  addPushTokenListener,
  ensurePushRegistration,
  ensurePushRegistrationIfStale,
  resetPushRegistrationStateForTests,
  handleNotificationResponse,
  unregisterPush,
  type NotificationResponseLike,
} from '../../lib/notifications';

function makeResponse(type: string, extra?: Record<string, string>): NotificationResponseLike {
  return {
    notification: {
      request: {
        content: {
          data: { type, ...extra },
        },
      },
    },
  };
}

describe('handleNotificationResponse passenger', () => {
  it('routes trip:message to Chat with tripId when present', () => {
    const navigate = jest.fn();
    handleNotificationResponse(
      makeResponse('trip:message', { trip_id: 'trip-abc', sender_role: 'driver' }),
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith('Chat', { tripId: 'trip-abc' });
  });

  it('routes trip:message to Chat without params when trip_id missing', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('trip:message'), navigate);
    expect(navigate).toHaveBeenCalledWith('Chat', undefined);
  });

  it('routes trip:verification to TripInProgress (code is shown there)', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('trip:verification', { trip_id: 't1' }), navigate);
    expect(navigate).toHaveBeenCalledWith('TripInProgress');
  });

  it('routes trip:arrived to TripInProgress', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('trip:arrived', { trip_id: 't1' }), navigate);
    expect(navigate).toHaveBeenCalledWith('TripInProgress');
  });

  it('routes debt and cancel-rate warnings to Profile', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('debt:warning'), navigate);
    handleNotificationResponse(makeResponse('cancel_rate:warning'), navigate);
    expect(navigate).toHaveBeenNthCalledWith(1, 'Profile');
    expect(navigate).toHaveBeenNthCalledWith(2, 'Profile');
  });

  it('routes trip:cancelled to Home', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('trip:cancelled'), navigate);
    expect(navigate).toHaveBeenCalledWith('Home');
  });
});

describe('passenger push registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[pass]' });
    mockSetNotificationChannelAsync.mockResolvedValue(undefined);
    mockApiPost.mockResolvedValue({ data: {} });
    mockApiDelete.mockResolvedValue({ data: {} });
    resetPushRegistrationStateForTests();
  });

  it('POSTs the token tagged with app=passenger', async () => {
    const token = await ensurePushRegistration();
    expect(token).toBe('ExponentPushToken[pass]');
    expect(mockApiPost).toHaveBeenCalledWith(
      '/notifications/token',
      expect.objectContaining({ token: 'ExponentPushToken[pass]', app: 'passenger' }),
    );
  });

  it('returns null and does not POST when permission is denied', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false });
    expect(await ensurePushRegistration()).toBeNull();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('unregisterPush DELETEs the registered token and never throws', async () => {
    await ensurePushRegistration();
    mockApiDelete.mockRejectedValueOnce(new Error('offline'));
    await expect(unregisterPush()).resolves.toBeUndefined();
    mockApiDelete.mockResolvedValue({ data: {} });
    await unregisterPush();
    expect(mockApiDelete).toHaveBeenLastCalledWith('/notifications/token', {
      params: { token: 'ExponentPushToken[pass]' },
    });
  });

  it('retries the POST after a transient failure', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: {} });
    const token = await ensurePushRegistration({ retryDelaysMs: [0, 0] });
    expect(token).toBe('ExponentPushToken[pass]');
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries without throwing', async () => {
    mockApiPost.mockRejectedValue(new Error('offline'));
    await expect(ensurePushRegistration({ retryDelaysMs: [0, 0] })).resolves.toBe(
      'ExponentPushToken[pass]',
    );
    expect(mockApiPost).toHaveBeenCalledTimes(3);
  });

  it('creates Android channels even when permission is denied', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false });
    await ensurePushRegistration();
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith('trip-chat', expect.anything());
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith('trip-requests', expect.anything());
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('ensurePushRegistrationIfStale skips a recent successful registration', async () => {
    await ensurePushRegistrationIfStale(60_000);
    await ensurePushRegistrationIfStale(60_000);
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('ensurePushRegistrationIfStale retries when the last attempt failed', async () => {
    mockApiPost.mockRejectedValue(new Error('offline'));
    await ensurePushRegistrationIfStale(60_000, { retryDelaysMs: [] });
    mockApiPost.mockResolvedValue({ data: {} });
    await ensurePushRegistrationIfStale(60_000, { retryDelaysMs: [] });
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it('addPushTokenListener subscribes to device token changes', async () => {
    const remove = jest.fn();
    mockAddPushTokenListener.mockReturnValue({ remove });
    const cb = jest.fn();
    const sub = await addPushTokenListener(cb);
    expect(mockAddPushTokenListener).toHaveBeenCalledWith(cb);
    sub?.remove();
    expect(remove).toHaveBeenCalled();
  });
});
