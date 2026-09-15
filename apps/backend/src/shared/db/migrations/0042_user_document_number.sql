ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "document_number" varchar(32);
CREATE INDEX IF NOT EXISTS "users_document_number_idx" ON "users" ("document_number") WHERE "document_number" IS NOT NULL;
