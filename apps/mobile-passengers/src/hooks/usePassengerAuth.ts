import { useAuthStore } from '@/store/authStore';

export function usePassengerAuth() {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const signOut = useAuthStore((s) => s.signOut);

  return {
    session,
    user: session?.user ?? null,
    loading,
    isAuthenticated: !!session,
    signOut,
  };
}
