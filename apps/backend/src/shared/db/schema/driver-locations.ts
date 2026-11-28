import { pgTable, real, timestamp, uuid } from 'drizzle-orm/pg-core';
import { drivers } from './drivers';

export const driverLocations = pgTable('driver_locations', {
  driver_id: uuid('driver_id')
    .primaryKey()
    .notNull()
    .references(() => drivers.id, { onDelete: 'cascade' }),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  heading: real('heading'),
  accuracy: real('accuracy'),
  speed: real('speed'),
  fix_at: timestamp('fix_at'),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
