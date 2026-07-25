import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const ONLINE_SINCE_KEY = 'lifty_online_since';

interface OnlineState {
  isOnline: boolean;
  onlineSince: number | null;
  heartbeatIntervalRef: ReturnType<typeof setInterval> | null;
  setOnline: (value: boolean) => void;
  setOnlineSince: (ts: number | null) => void;
  setHeartbeatRef: (ref: ReturnType<typeof setInterval> | null) => void;
}

export const useOnlineStore = create<OnlineState>()((set) => ({
  isOnline: false,
  onlineSince: null,
  heartbeatIntervalRef: null,
  setOnline: (isOnline) => {
    if (isOnline) {
      const now = Date.now();
      AsyncStorage.setItem(ONLINE_SINCE_KEY, String(now)).catch(() => {});
      set({ isOnline: true, onlineSince: now });
    } else {
      AsyncStorage.removeItem(ONLINE_SINCE_KEY).catch(() => {});
      set({ isOnline: false, onlineSince: null });
    }
  },
  setOnlineSince: (onlineSince) => set({ onlineSince }),
  setHeartbeatRef: (heartbeatIntervalRef) => set({ heartbeatIntervalRef }),
}));
