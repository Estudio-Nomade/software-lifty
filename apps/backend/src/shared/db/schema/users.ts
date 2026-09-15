import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  role: varchar('role', { length: 20 }).notNull().default('driver'),
  full_name: varchar('full_name', { length: 255 }),
  avatar_url: varchar('avatar_url', { length: 512 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  kyc_status: varchar('kyc_status', { length: 30 }).notNull().default('pending'),
  verified_name: varchar('verified_name', { length: 255 }),
  verified_document_hash: varchar('verified_document_hash', { length: 64 }),
  /** Full national ID / DNI for ops registry (admin + transit join). */
  document_number: varchar('document_number', { length: 32 }),
  document_number_last4: varchar('document_number_last4', { length: 4 }),
});
