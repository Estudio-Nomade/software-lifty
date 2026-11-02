-- Persist passenger-requested vehicle class on trips so matching/rematch/accept
-- can enforce auto ≠ moto (canonical values: auto | moto).
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS vehicle_type varchar(20) NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN trips.vehicle_type IS 'Passenger-requested class: auto | moto. Used by matching and accept guards.';
