import { useAuthStore } from '@/store/authStore';

export function usePassengerAuth() {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);

  return {
    token,
    userId,
    isAuthenticated,
    loading: !sessionRestored,
  };
}
