-- Web Push (PWA admin): endpoint can exceed 512 chars; store VAPID keys separately.
ALTER TABLE "push_tokens" ALTER COLUMN "token" TYPE text;
ALTER TABLE "push_tokens" ADD COLUMN IF NOT EXISTS "web_p256dh" text;
ALTER TABLE "push_tokens" ADD COLUMN IF NOT EXISTS "web_auth" text;
