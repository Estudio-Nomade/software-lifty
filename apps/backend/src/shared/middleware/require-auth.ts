import { Elysia } from 'elysia';
import { authPlugin } from './auth';

function authErrorBody(code: 'TOKEN_REQUIRED' | 'TOKEN_EXPIRED', message: string) {
  return {
    error: { code, message, status: 401 as const },
    meta: { timestamp: new Date().toISOString() },
  };
}

export const authGuard = new Elysia({ name: 'auth-guard' }).use(authPlugin).macro({
  requireAuth(enabled: boolean) {
    if (!enabled) return {};
    return {
      resolve({ user, authStatus, status }) {
        if (!user) {
          if (authStatus === 'token_expired') {
            return status(401, authErrorBody('TOKEN_EXPIRED', 'Token expired, please refresh'));
          }
          return status(401, authErrorBody('TOKEN_REQUIRED', 'Se requiere iniciar sesión.'));
        }
        return { user };
      },
    };
  },
});
