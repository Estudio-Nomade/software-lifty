ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "transit_district_id" uuid REFERENCES "districts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "users_transit_district_id_idx" ON "users" ("transit_district_id") WHERE "transit_district_id" IS NOT NULL;
