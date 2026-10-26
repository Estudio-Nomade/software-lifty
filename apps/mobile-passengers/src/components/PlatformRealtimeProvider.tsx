import { useEffect } from 'react';
import { subscribeToPlatformConfig } from '../lib/platformRealtime';
import { useAuthStore } from '../store/authStore';

/** Admin/platform config → invalidate passenger queries while signed in. */
export function PlatformRealtimeProvider() {
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!sessionRestored || !token) return;
    return subscribeToPlatformConfig();
  }, [sessionRestored, token]);

  return null;
}
