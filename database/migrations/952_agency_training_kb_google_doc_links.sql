-- Migration 952: Google Doc source links for Training Knowledge Base
-- Lets admins paste a public Google Docs URL; the app exports PDF snapshots and can refresh them.

ALTER TABLE agency_training_kb_documents
  ADD COLUMN source_url VARCHAR(1024) NULL DEFAULT NULL
    COMMENT 'Original Google Docs (or other) URL when this KB file is a linked snapshot',
  ADD COLUMN source_kind VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Source type, e.g. google_doc',
  ADD COLUMN last_synced_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When the snapshot was last pulled from source_url';

CREATE INDEX idx_agency_training_kb_source
  ON agency_training_kb_documents (agency_id, source_kind, last_synced_at);
