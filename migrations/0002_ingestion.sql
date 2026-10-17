-- Keep the existing work/edition/copy and composite household boundaries.
-- Nullable identities let old rows be reused by normalized matching without rewriting seed data.
ALTER TABLE books ADD COLUMN identity_key TEXT;
CREATE UNIQUE INDEX work_identity ON books(identity_key) WHERE identity_key IS NOT NULL;
ALTER TABLE book_editions ADD COLUMN identity_key TEXT;
ALTER TABLE book_editions ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX edition_identity ON book_editions(identity_key) WHERE identity_key IS NOT NULL;
ALTER TABLE scan_sessions ADD COLUMN processing_state TEXT NOT NULL DEFAULT 'review' CHECK(processing_state IN ('processing','review','completed','failed'));
UPDATE scan_sessions SET processing_state=status;
ALTER TABLE scan_sessions ADD COLUMN warnings_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE scan_images ADD COLUMN processing_state TEXT NOT NULL DEFAULT 'pending' CHECK(processing_state IN ('pending','processing','completed','failed'));
ALTER TABLE scan_images ADD COLUMN error TEXT;
ALTER TABLE recognition_candidates ADD COLUMN enrichment_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE recognition_candidates ADD COLUMN raw_confidence REAL;
-- A DB-enforced per-household window works across worker instances.
CREATE TABLE ingestion_rate_windows (
  household_id TEXT NOT NULL REFERENCES households(id),
  operation TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(household_id,operation,window)
);

ALTER TABLE scan_sessions ADD COLUMN processing_started_at TEXT;
