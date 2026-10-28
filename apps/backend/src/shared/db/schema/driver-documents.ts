import { boolean, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { drivers } from './drivers';
import { users } from './users';

export const driverDocuments = pgTable('driver_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => drivers.id, { onDelete: 'cascade' }),
  doc_type: varchar('doc_type', { length: 50 }).notNull(),
  file_url: varchar('file_url', { length: 512 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending_review'),
  verified_at: timestamp('verified_at'),
  expires_at: timestamp('expires_at'),
  superseded_at: timestamp('superseded_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  ops_ok: boolean('ops_ok').notNull().default(false),
  review_comment: text('review_comment'),
  ops_reviewed_at: timestamp('ops_reviewed_at', { withTimezone: true }),
  ops_reviewed_by: uuid('ops_reviewed_by').references(() => users.id, { onDelete: 'set null' }),
});
