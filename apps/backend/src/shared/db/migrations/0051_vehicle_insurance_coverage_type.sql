-- Declared vehicle insurance coverage for motos (third_party | comprehensive). Cars stay null.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_coverage_type varchar(30);

COMMENT ON COLUMN vehicles.insurance_coverage_type IS 'Moto póliza: third_party | comprehensive; auto null.';
