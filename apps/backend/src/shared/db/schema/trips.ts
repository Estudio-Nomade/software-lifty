import {
  boolean,
  char,
  doublePrecision,
  integer,
  pgTable,
  real,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { drivers } from './drivers';

export const trips = pgTable('trips', {
  id: uuid('id').defaultRandom().primaryKey(),
  passenger_id: uuid('passenger_id'),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => drivers.id),
  status: varchar('status', { length: 30 }).notNull().default('request_received'),
  origin_lat: real('origin_lat').notNull(),
  origin_lng: real('origin_lng').notNull(),
  dest_lat: real('dest_lat').notNull(),
  dest_lng: real('dest_lng').notNull(),
  origin_address: varchar('origin_address', { length: 512 }),
  dest_address: varchar('dest_address', { length: 512 }),
  distance_km: real('distance_km'),
  duration_minutes: integer('duration_minutes'),
  base_fare: doublePrecision('base_fare'),
  distance_fare: doublePrecision('distance_fare'),
  time_fare: doublePrecision('time_fare'),
  total_fare: doublePrecision('total_fare'),
  platform_fee: doublePrecision('platform_fee'),
  driver_earnings: doublePrecision('driver_earnings'),
  payment_method: varchar('payment_method', { length: 30 }).default('cash'),
  is_collected: boolean('is_collected').default(false).notNull(),
  tolerance_minutes: integer('tolerance_minutes').default(5),
  waiting_since: timestamp('waiting_since'),
  verification_code: char('verification_code', { length: 4 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
