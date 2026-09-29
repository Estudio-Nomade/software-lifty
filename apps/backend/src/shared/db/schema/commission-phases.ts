import { doublePrecision, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const commissionPhases = pgTable('commission_phases', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  day_start: integer('day_start').notNull(),
  day_end: integer('day_end'),
  base_rate: doublePrecision('base_rate').notNull().default(0),
  daily_increment: doublePrecision('daily_increment'),
  cap_rate: doublePrecision('cap_rate'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
