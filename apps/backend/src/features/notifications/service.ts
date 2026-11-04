import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { pushTokens } from '../../shared/db/schema';
import type { AuthUser } from '../../shared/middleware/auth';

export type PushApp = 'driver' | 'passenger';

export const notificationsService = {
  async registerToken(user: AuthUser, token: string, platform?: string, app?: PushApp) {
    const appValue = app ?? 'legacy';
    const platformValue = platform ?? 'android';

    await db.transaction(async (tx) => {
      // A device token belongs to one install: if another account used this device
      // before (logout without unregister), drop its rows so it stops receiving pushes.
      await tx
        .delete(pushTokens)
        .where(
          and(
            eq(pushTokens.token, token),
            ne(pushTokens.user_id, user.id),
            ne(pushTokens.platform, 'web'),
          ),
        );

      // Explicit app registration supersedes the legacy row of the same device.
      if (appValue !== 'legacy') {
        await tx
          .delete(pushTokens)
          .where(
            and(
              eq(pushTokens.user_id, user.id),
              eq(pushTokens.token, token),
              eq(pushTokens.app, 'legacy'),
            ),
          );
      }

      await tx
        .insert(pushTokens)
        .values({ user_id: user.id, token, platform: platformValue, app: appValue })
        .onConflictDoUpdate({
          target: [pushTokens.user_id, pushTokens.app, pushTokens.token],
          set: { platform: platformValue },
        });
    });
    return { message: 'Token registered' };
  },

  /**
   * Unregister this device (token given) or, for old clients, every native token of
   * the user. Web-push (admin PWA) subscriptions are never touched here.
   */
  async removeToken(user: AuthUser, token?: string) {
    const conditions = [eq(pushTokens.user_id, user.id), ne(pushTokens.platform, 'web')];
    if (token) conditions.push(eq(pushTokens.token, token));
    await db.delete(pushTokens).where(and(...conditions));
    return { message: 'Token removed' };
  },
};
