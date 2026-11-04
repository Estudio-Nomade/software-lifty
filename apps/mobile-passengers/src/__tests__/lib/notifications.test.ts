const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();

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
}));
jest.mock('../../api/client', () => ({
  api: {
    post: (...a: unknown[]) => mockApiPost(...a),
    delete: (...a: unknown[]) => mockApiDelete(...a),
  },
}));

import {
  ensurePushRegistration,
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
});
