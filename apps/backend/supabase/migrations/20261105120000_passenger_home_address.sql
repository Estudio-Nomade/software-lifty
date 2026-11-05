-- Passenger home/casa address for complete-profile + optional trip origin chip.

ALTER TABLE "passenger_profiles" ADD COLUMN IF NOT EXISTS "home_address_line" text;
ALTER TABLE "passenger_profiles" ADD COLUMN IF NOT EXISTS "home_lat" real;
ALTER TABLE "passenger_profiles" ADD COLUMN IF NOT EXISTS "home_lng" real;
ALTER TABLE "passenger_profiles" ADD COLUMN IF NOT EXISTS "home_resolved_city" text;
ALTER TABLE "passenger_profiles" ADD COLUMN IF NOT EXISTS "home_resolved_province" text;
