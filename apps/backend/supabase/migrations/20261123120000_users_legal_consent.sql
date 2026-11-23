-- Latest legal consent on users (TyC + privacy versions).
-- Keep in sync with src/shared/db/migrations/0064_users_legal_consent.sql

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version" varchar(64);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_version" varchar(64);
