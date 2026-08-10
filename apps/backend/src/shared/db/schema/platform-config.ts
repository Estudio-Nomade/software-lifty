import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const platformConfig = pgTable('platform_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 100 }).unique().notNull(),
  value: text('value').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
