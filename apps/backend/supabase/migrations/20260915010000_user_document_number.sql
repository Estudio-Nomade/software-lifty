-- Full document number (DNI) for admin registry / transit join.
-- Hash + last4 already exist; ops needs the readable ID.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS document_number varchar(32) NULL;

CREATE INDEX IF NOT EXISTS users_document_number_idx
  ON users (document_number)
  WHERE document_number IS NOT NULL;

COMMENT ON COLUMN users.document_number IS 'National ID / DNI plain for admin registry (ops + transit)';
