import type { AuthUser } from './auth';

export function requireRole(...roles: string[]) {
  return ({ user, set }: { user: AuthUser | null; set: { status: number } }) => {
    if (!user || !user.role) {
      set.status = 403;
      return { error: 'Forbidden' };
    }
    const userRoles = user.role === 'both' ? ['driver', 'passenger'] : [user.role];
    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      set.status = 403;
      return { error: 'Forbidden' };
    }
  };
}
