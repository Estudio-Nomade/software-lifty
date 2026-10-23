import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { drivers } from './drivers';
import { users } from './users';

export const driverCommissionReceipts = pgTable('driver_commission_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => drivers.id, { onDelete: 'cascade' }),
  amount_ars: integer('amount_ars').notNull(),
  debt_before_ars: integer('debt_before_ars').notNull(),
  file_url: text('file_url').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending_review'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  reviewed_by: uuid('reviewed_by').references(() => users.id),
  note: text('note'),
});
