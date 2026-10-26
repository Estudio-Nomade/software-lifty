CREATE TABLE IF NOT EXISTS driver_account_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  author_admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type varchar(40) NOT NULL DEFAULT 'review_notes',
  body text NOT NULL,
  email_status varchar(30),
  push_status varchar(30),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_account_messages_driver_created
  ON driver_account_messages (driver_id, created_at DESC);
