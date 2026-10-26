import { useMessagesUnreadStore } from '../../store/messagesUnreadStore';

describe('messagesUnreadStore', () => {
  beforeEach(() => {
    useMessagesUnreadStore.getState().clearUnread();
  });

  test('setUnreadCount clamps negative and floors', () => {
    useMessagesUnreadStore.getState().setUnreadCount(3.9);
    expect(useMessagesUnreadStore.getState().unreadCount).toBe(3);
    useMessagesUnreadStore.getState().setUnreadCount(-1);
    expect(useMessagesUnreadStore.getState().unreadCount).toBe(0);
  });

  test('bumpUnread increments', () => {
    useMessagesUnreadStore.getState().bumpUnread();
    useMessagesUnreadStore.getState().bumpUnread(2);
    expect(useMessagesUnreadStore.getState().unreadCount).toBe(3);
  });
});
