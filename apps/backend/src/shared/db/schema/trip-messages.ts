import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { trips } from './trips';
import { users } from './users';

export const tripMessages = pgTable('trip_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  sender_id: uuid('sender_id')
    .notNull()
    .references(() => users.id),
  sender_role: varchar('sender_role', { length: 20 }).notNull(),
  text: varchar('text', { length: 1000 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
