ALTER TABLE trips ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE TABLE IF NOT EXISTS cancelation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  driver_id uuid,
  stage varchar(30) NOT NULL,
  reason varchar(30) NOT NULL,
  actor varchar(20) NOT NULL,
  fee_applied integer NOT NULL,
  credit_driver boolean NOT NULL,
  counts_for_tvf boolean NOT NULL,
  collection_phase integer NOT NULL,
  cancelation_time timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_debt (
  user_id uuid PRIMARY KEY,
  amount_ars integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'pending',
  last_notified_2500_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_fee_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  amount_ars integer NOT NULL,
  status varchar(20) NOT NULL,
  collection_phase integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(20) NOT NULL,
  subject_id uuid NOT NULL,
  kind varchar(40) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_blocks_subject_idx ON user_blocks (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS user_cancelation_metrics (
  user_id uuid PRIMARY KEY,
  period_days integer NOT NULL DEFAULT 30,
  total_trips_requested integer NOT NULL DEFAULT 0,
  total_cancelations integer NOT NULL DEFAULT 0,
  pre_assign_cancelations integer NOT NULL DEFAULT 0,
  cancelation_rate_bp integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_tvf_metrics (
  driver_id uuid PRIMARY KEY,
  period_days integer NOT NULL DEFAULT 30,
  total_completed integer NOT NULL DEFAULT 0,
  total_tvf_cancels integer NOT NULL DEFAULT 0,
  tvf_rate_bp integer NOT NULL DEFAULT 10000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
