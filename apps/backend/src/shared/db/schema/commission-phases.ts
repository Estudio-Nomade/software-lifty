import { doublePrecision, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const commissionPhases = pgTable('commission_phases', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  month_start: integer('month_start').notNull(),
  month_end: integer('month_end'),
  base_rate: doublePrecision('base_rate').notNull().default(0),
  monthly_increment: doublePrecision('monthly_increment'),
  cap_rate: doublePrecision('cap_rate'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
