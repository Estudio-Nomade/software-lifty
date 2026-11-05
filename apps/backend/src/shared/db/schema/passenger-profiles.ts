import { pgTable, real, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const passengerProfiles = pgTable('passenger_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  phone: varchar('phone', { length: 20 }),
  home_address_line: text('home_address_line'),
  home_lat: real('home_lat'),
  home_lng: real('home_lng'),
  home_resolved_city: text('home_resolved_city'),
  home_resolved_province: text('home_resolved_province'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
