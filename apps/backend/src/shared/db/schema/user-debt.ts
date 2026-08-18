import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const userDebt = pgTable('user_debt', {
  user_id: uuid('user_id').primaryKey(),
  amount_ars: integer('amount_ars').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  last_notified_2500_at: timestamp('last_notified_2500_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
