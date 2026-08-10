import { doublePrecision, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const fuelPriceLog = pgTable('fuel_price_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  price: doublePrecision('price').notNull(),
  updated_by: varchar('updated_by', { length: 255 }).notNull(),
  source: varchar('source', { length: 255 }),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
