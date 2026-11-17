import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Account deletion workflow rows.
 * Backend-only (no anon/authenticated grants). Tokens stored hashed.
 */
export const accountDeletionRequests = pgTable(
  'account_deletion_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id'),
    auth_user_id: uuid('auth_user_id'),
    email_normalized: text('email_normalized').notNull(),
    email_hash: text('email_hash'),
    requested_role_hint: varchar('requested_role_hint', { length: 20 }),
    source: varchar('source', { length: 10 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    verify_token_hash: text('verify_token_hash'),
    verify_expires_at: timestamp('verify_expires_at', { withTimezone: true }),
    verified_at: timestamp('verified_at', { withTimezone: true }),
    requested_at: timestamp('requested_at', { withTimezone: true }),
    processing_started_at: timestamp('processing_started_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    retention_details: jsonb('retention_details')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    error_details: text('error_details'),
    idempotency_key: text('idempotency_key'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('account_deletion_requests_email_status_idx').on(table.email_normalized, table.status),
    index('account_deletion_requests_user_id_idx').on(table.user_id),
    index('account_deletion_requests_status_requested_idx').on(table.status, table.requested_at),
    uniqueIndex('account_deletion_requests_idempotency_uidx').on(table.idempotency_key),
  ],
);
