import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { drivers } from './drivers';

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => drivers.id, { onDelete: 'cascade' }),
  brand: varchar('brand', { length: 100 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  year: integer('year').notNull(),
  color: varchar('color', { length: 50 }).notNull(),
  plate: varchar('plate', { length: 20 }).notNull(),
  vehicle_type: varchar('vehicle_type', { length: 50 }).notNull().default('car'),
  /** Declared motorcycle displacement (cc). Null for cars. */
  engine_cc: integer('engine_cc'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
