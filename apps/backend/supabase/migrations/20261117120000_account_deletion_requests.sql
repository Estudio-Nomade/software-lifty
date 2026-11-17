-- Account deletion requests (backend-only workflow; no client grants).

CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "auth_user_id" uuid,
  "email_normalized" text NOT NULL,
  "email_hash" text,
  "requested_role_hint" varchar(20),
  "source" varchar(10) NOT NULL,
  "status" varchar(30) NOT NULL,
  "verify_token_hash" text,
  "verify_expires_at" timestamptz,
  "verified_at" timestamptz,
  "requested_at" timestamptz,
  "processing_started_at" timestamptz,
  "completed_at" timestamptz,
  "retention_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_details" text,
  "idempotency_key" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_deletion_requests_email_status_idx"
  ON "account_deletion_requests" ("email_normalized", "status");

CREATE INDEX IF NOT EXISTS "account_deletion_requests_user_id_idx"
  ON "account_deletion_requests" ("user_id");

CREATE INDEX IF NOT EXISTS "account_deletion_requests_status_requested_idx"
  ON "account_deletion_requests" ("status", "requested_at");

CREATE UNIQUE INDEX IF NOT EXISTS "account_deletion_requests_idempotency_uidx"
  ON "account_deletion_requests" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Backend uses DATABASE_URL / service role only. Revoke public access if RLS enabled later.
ALTER TABLE "account_deletion_requests" ENABLE ROW LEVEL SECURITY;
