import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { drivers } from './drivers';
import { users } from './users';

export const driverAccountMessages = pgTable('driver_account_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => drivers.id, { onDelete: 'cascade' }),
  author_admin_user_id: uuid('author_admin_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  type: varchar('type', { length: 40 }).notNull().default('review_notes'),
  body: text('body').notNull(),
  email_status: varchar('email_status', { length: 30 }),
  push_status: varchar('push_status', { length: 30 }),
  read_at: timestamp('read_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
