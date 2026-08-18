import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { trips } from './trips';

export const cancelationLog = pgTable('cancelation_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  trip_id: uuid('trip_id')
    .notNull()
    .unique()
    .references(() => trips.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull(),
  driver_id: uuid('driver_id'),
  stage: varchar('stage', { length: 30 }).notNull(),
  reason: varchar('reason', { length: 30 }).notNull(),
  actor: varchar('actor', { length: 20 }).notNull(),
  fee_applied: integer('fee_applied').notNull(),
  credit_driver: boolean('credit_driver').notNull(),
  counts_for_tvf: boolean('counts_for_tvf').notNull(),
  collection_phase: integer('collection_phase').notNull(),
  cancelation_time: timestamp('cancelation_time', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
