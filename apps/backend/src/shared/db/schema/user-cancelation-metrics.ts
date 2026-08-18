import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userCancelationMetrics = pgTable('user_cancelation_metrics', {
  user_id: uuid('user_id').primaryKey(),
  period_days: integer('period_days').notNull().default(30),
  total_trips_requested: integer('total_trips_requested').notNull().default(0),
  total_cancelations: integer('total_cancelations').notNull().default(0),
  pre_assign_cancelations: integer('pre_assign_cancelations').notNull().default(0),
  cancelation_rate_bp: integer('cancelation_rate_bp').notNull().default(0),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
