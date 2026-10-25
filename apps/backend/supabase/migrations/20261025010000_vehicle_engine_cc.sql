-- Declared motorcycle engine displacement (cc). Cars stay null.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS engine_cc integer;

COMMENT ON COLUMN vehicles.engine_cc IS 'Moto cilindrada declarada (cc); auto null. Min policy 150 for motorcycle.';
