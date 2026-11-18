-- Permanent completion GPS evidence + exception allow-list fields on trips.
-- dest_lat/lng/address remain the requested destination and are never overwritten.

ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "completed_lat" real;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "completed_lng" real;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "completed_distance_m" real;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "completed_gps_accuracy_m" real;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "completion_type" varchar(30);
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "completion_exception_reason" varchar(64);
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "completion_exception_note" varchar(200);
