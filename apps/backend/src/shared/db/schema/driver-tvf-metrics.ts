import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const driverTvfMetrics = pgTable('driver_tvf_metrics', {
  driver_id: uuid('driver_id').primaryKey(),
  period_days: integer('period_days').notNull().default(30),
  total_completed: integer('total_completed').notNull().default(0),
  total_tvf_cancels: integer('total_tvf_cancels').notNull().default(0),
  tvf_rate_bp: integer('tvf_rate_bp').notNull().default(10000),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
