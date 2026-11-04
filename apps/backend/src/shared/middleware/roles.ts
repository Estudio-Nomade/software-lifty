import { ForbiddenError } from '../lib/errors';
import type { AuthUser } from './auth';

export const STAFF_ROLES = ['admin', 'transit'] as const;

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

/** Staff (admin/transit) accounts must never act as, or auto-create, driver/passenger profiles. */
export function assertNotStaff(user: Pick<AuthUser, 'role'>): void {
  if (isStaffRole(user.role)) {
    throw new ForbiddenError('Las cuentas de staff no pueden usar esta función');
  }
}

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
