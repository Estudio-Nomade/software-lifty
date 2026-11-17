-- Speed direct verify_token_hash lookups (web verify).
CREATE INDEX IF NOT EXISTS "account_deletion_requests_verify_token_hash_idx"
  ON "account_deletion_requests" ("verify_token_hash");
