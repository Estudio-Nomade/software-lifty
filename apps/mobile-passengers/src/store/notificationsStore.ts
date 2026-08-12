import { create } from 'zustand';

export interface PassengerNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

interface NotificationsStore {
  items: PassengerNotification[];
  unreadCount: number;
  setItems: (items: PassengerNotification[]) => void;
  markAllRead: () => void;
}

export const useNotificationsStore = create<NotificationsStore>((set) => ({
  items: [],
  unreadCount: 0,
  setItems: (items) =>
    set({
      items,
      unreadCount: items.filter((n) => !n.read).length,
    }),
  markAllRead: () =>
    set((state) => ({
      items: state.items.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
}));
