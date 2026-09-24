-- Driver domicilio + municipality eligibility (operational | waitlisted).
-- intended_district_id is the Photon match; district_id remains set only via setDistrict after approved.

ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "address_line" text;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "address_lat" real;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "address_lng" real;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "address_resolved_city" text;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "address_resolved_province" text;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "municipality_status" varchar(20) NOT NULL DEFAULT 'unset';
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "intended_district_id" uuid REFERENCES "districts"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "drivers_municipality_status_idx" ON "drivers" ("municipality_status");
CREATE INDEX IF NOT EXISTS "drivers_intended_district_id_idx" ON "drivers" ("intended_district_id") WHERE "intended_district_id" IS NOT NULL;
