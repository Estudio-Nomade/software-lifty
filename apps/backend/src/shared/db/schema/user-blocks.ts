import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const userBlocks = pgTable('user_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  subject_type: varchar('subject_type', { length: 20 }).notNull(),
  subject_id: uuid('subject_id').notNull(),
  kind: varchar('kind', { length: 40 }).notNull(),
  starts_at: timestamp('starts_at', { withTimezone: true }).notNull(),
  ends_at: timestamp('ends_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
