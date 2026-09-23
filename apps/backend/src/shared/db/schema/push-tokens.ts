import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

// One row per (user, device token): a user can hold several devices.
// platform: expo|android|ios|web. For web, token = PushSubscription.endpoint
// and web_p256dh / web_auth hold the keys.
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: varchar('platform', { length: 20 }).notNull().default('android'),
    web_p256dh: text('web_p256dh'),
    web_auth: text('web_auth'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('push_tokens_user_device_unique').on(table.user_id, table.token)],
);
