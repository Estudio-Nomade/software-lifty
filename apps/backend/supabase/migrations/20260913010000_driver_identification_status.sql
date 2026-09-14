-- Hard gate: physical identification / stickers from municipal transit.
-- Backfill all existing drivers to pending_pickup (lock ON). Never auto-issued.

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS identification_status varchar(30) NOT NULL DEFAULT 'pending_pickup',
  ADD COLUMN IF NOT EXISTS identification_issued_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS identification_external_ref text NULL;

COMMENT ON COLUMN drivers.identification_status IS 'pending_pickup | issued | revoked — Axis B stickers gate';
COMMENT ON COLUMN drivers.identification_issued_at IS 'When transit bridge confirmed sticker delivery';
COMMENT ON COLUMN drivers.identification_external_ref IS 'Optional audit id from web-transito';
