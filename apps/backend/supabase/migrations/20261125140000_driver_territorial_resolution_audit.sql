-- Territorial resolution audit fields (coords-first municipality gate).
-- Photon/geocoder labels are stored separately from canonical municipality.
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "geocoder_city" text;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "geocoder_province" text;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "resolution_method" varchar(40);
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "service_market_id" uuid;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "address_accuracy_m" real;
