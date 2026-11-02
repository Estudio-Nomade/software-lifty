import { doublePrecision, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { districts } from './districts';

/** Operational geo market (hub + radii). Separate from legal `districts`. */
export const serviceMarkets = pgTable('service_markets', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  hub_lat: doublePrecision('hub_lat').notNull(),
  hub_lng: doublePrecision('hub_lng').notNull(),
  pickup_radius_km: doublePrecision('pickup_radius_km').notNull().default(8),
  dropoff_radius_km: doublePrecision('dropoff_radius_km').notNull().default(50),
  match_radius_km: doublePrecision('match_radius_km').notNull().default(8),
  geo_bias_radius_km: doublePrecision('geo_bias_radius_km').notNull().default(20),
  default_district_id: uuid('default_district_id').references(() => districts.id, {
    onDelete: 'set null',
  }),
  timezone: varchar('timezone', { length: 64 }).notNull().default('America/Argentina/Cordoba'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const serviceMarketAliases = pgTable('service_market_aliases', {
  id: uuid('id').defaultRandom().primaryKey(),
  market_id: uuid('market_id')
    .notNull()
    .references(() => serviceMarkets.id, { onDelete: 'cascade' }),
  alias: varchar('alias', { length: 120 }).notNull(),
  alias_normalized: varchar('alias_normalized', { length: 120 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
