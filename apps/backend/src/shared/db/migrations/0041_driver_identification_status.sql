ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "identification_status" varchar(30) DEFAULT 'pending_pickup' NOT NULL;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "identification_issued_at" timestamp with time zone;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "identification_external_ref" text;
