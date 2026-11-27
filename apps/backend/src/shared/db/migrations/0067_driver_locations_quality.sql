-- GPS fix quality for driver_locations (accuracy meters, speed m/s, device fix time).
-- Keep in sync with supabase/migrations/20261126120000_driver_locations_quality.sql
ALTER TABLE "driver_locations"
  ADD COLUMN IF NOT EXISTS "accuracy" real,
  ADD COLUMN IF NOT EXISTS "speed" real,
  ADD COLUMN IF NOT EXISTS "fix_at" timestamp;
