ALTER TABLE driver_documents
  ADD COLUMN IF NOT EXISTS ops_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_comment text,
  ADD COLUMN IF NOT EXISTS ops_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ops_reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
