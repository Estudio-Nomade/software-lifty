-- License category + 60d professional carnet grace (clock starts on first online).
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS license_category varchar(30),
  ADD COLUMN IF NOT EXISTS license_professional_status varchar(30) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS professional_license_grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS professional_license_due_at timestamptz;

COMMENT ON COLUMN drivers.license_category IS 'Declared license class e.g. A3, B, professional';
COMMENT ON COLUMN drivers.license_professional_status IS 'unknown | professional | pending_professional | not_required';
COMMENT ON COLUMN drivers.professional_license_grace_started_at IS 'First successful is_online=true when pending_professional';
COMMENT ON COLUMN drivers.professional_license_due_at IS 'grace_started_at + 60 days; one-shot';
