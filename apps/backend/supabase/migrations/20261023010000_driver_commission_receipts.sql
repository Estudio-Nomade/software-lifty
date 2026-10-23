CREATE TABLE IF NOT EXISTS driver_commission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  amount_ars integer NOT NULL,
  debt_before_ars integer NOT NULL,
  file_url text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  note text
);

CREATE INDEX IF NOT EXISTS idx_driver_commission_receipts_driver_id
  ON driver_commission_receipts (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_commission_receipts_status
  ON driver_commission_receipts (status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_commission_receipt_pending
  ON driver_commission_receipts (driver_id)
  WHERE status = 'pending_review';

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS commission_fraud_block boolean NOT NULL DEFAULT false;
