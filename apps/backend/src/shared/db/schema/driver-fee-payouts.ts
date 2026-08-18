import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { trips } from './trips';

export const driverFeePayouts = pgTable('driver_fee_payouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  trip_id: uuid('trip_id')
    .notNull()
    .unique()
    .references(() => trips.id, { onDelete: 'cascade' }),
  driver_id: uuid('driver_id').notNull(),
  amount_ars: integer('amount_ars').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  collection_phase: integer('collection_phase').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  paid_at: timestamp('paid_at', { withTimezone: true }),
});
