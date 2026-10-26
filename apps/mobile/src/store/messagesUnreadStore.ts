import { create } from 'zustand';

interface MessagesUnreadState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  bumpUnread: (by?: number) => void;
  clearUnread: () => void;
}

export const useMessagesUnreadStore = create<MessagesUnreadState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: Math.max(0, Math.floor(count) || 0) }),
  bumpUnread: (by = 1) =>
    set((s) => ({ unreadCount: Math.max(0, s.unreadCount + (Number.isFinite(by) ? by : 1)) })),
  clearUnread: () => set({ unreadCount: 0 }),
}));
