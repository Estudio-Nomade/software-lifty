ALTER TABLE districts ADD COLUMN IF NOT EXISTS terms_and_conditions text;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS privacy_policy text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id) ON DELETE SET NULL;
