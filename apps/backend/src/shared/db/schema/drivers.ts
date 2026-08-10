import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { districts } from './districts';
import { users } from './users';

export const drivers = pgTable('drivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 30 }).notNull().default('step1'),
  rating_avg: real('rating_avg').default(0),
  total_trips: integer('total_trips').default(0),
  completion_rate: real('completion_rate').default(0),
  kyc_status: varchar('kyc_status', { length: 30 }).notNull().default('pending'),
  is_online: boolean('is_online').default(false),
  documents_pending_review: boolean('documents_pending_review').notNull().default(false),
  admin_review_status: varchar('admin_review_status', { length: 30 }).notNull().default('pending'),
  admin_reviewed_by: uuid('admin_reviewed_by').references(() => users.id),
  admin_reviewed_at: timestamp('admin_reviewed_at'),
  admin_review_notes: text('admin_review_notes'),
  district_id: uuid('district_id').references(() => districts.id, { onDelete: 'set null' }),
  approval_token: text('approval_token').unique(),
  approved_at: timestamp('approved_at'),
  platform_debt: doublePrecision('platform_debt').default(0).notNull(),
  last_heartbeat: timestamp('last_heartbeat', { withTimezone: true }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
