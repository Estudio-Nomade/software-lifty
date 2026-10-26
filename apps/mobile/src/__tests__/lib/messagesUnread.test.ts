import { apiClient } from '../../api/client';
import { refreshMessagesUnread, syncOsAppBadge } from '../../lib/messagesUnread';
import { useMessagesUnreadStore } from '../../store/messagesUnreadStore';

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

jest.mock('../../lib/notifications', () => ({
  isRemotePushAvailable: () => false,
}));

const getMock = apiClient.get as jest.Mock;

describe('refreshMessagesUnread', () => {
  beforeEach(() => {
    useMessagesUnreadStore.setState({ unreadCount: 0 });
    getMock.mockReset();
  });

  test('sets store from server unread_count', async () => {
    getMock.mockResolvedValueOnce({ data: { data: { unread_count: 4 } } });
    const next = await refreshMessagesUnread();
    expect(next).toBe(4);
    expect(useMessagesUnreadStore.getState().unreadCount).toBe(4);
  });

  test('on failure keeps store and returns current (no optimistic drift)', async () => {
    useMessagesUnreadStore.setState({ unreadCount: 2 });
    getMock.mockRejectedValueOnce(new Error('offline'));
    const next = await refreshMessagesUnread();
    expect(next).toBe(2);
    expect(useMessagesUnreadStore.getState().unreadCount).toBe(2);
  });
});

describe('syncOsAppBadge', () => {
  test('no-ops when remote push unavailable (Expo Go Android / web)', async () => {
    await expect(syncOsAppBadge(3)).resolves.toBeUndefined();
  });
});
