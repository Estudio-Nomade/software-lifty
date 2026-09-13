import { useAuth } from '@/hooks/useAuth';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from './AppShell';

export function ProtectedRoute() {
  const { initialized, session, isAdmin } = useAuth();
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="flex h-full min-h-dvh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
