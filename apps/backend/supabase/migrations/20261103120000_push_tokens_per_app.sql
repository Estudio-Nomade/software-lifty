-- Push tokens are scoped per app (driver / passenger). Existing rows stay 'legacy'
-- and keep receiving pushes for every app until the client re-registers with an app.
ALTER TABLE "push_tokens" ADD COLUMN IF NOT EXISTS "app" varchar(20) NOT NULL DEFAULT 'legacy';
DROP INDEX IF EXISTS "push_tokens_user_device_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_user_app_token_unique" ON "push_tokens" ("user_id", "app", "token");
CREATE INDEX IF NOT EXISTS "push_tokens_token_idx" ON "push_tokens" ("token");
