-- Migration: allow links in school public documents
-- Purpose: support "Docs/Links" items that are shared via URL (not only uploaded files).

ALTER TABLE school_public_documents
  MODIFY COLUMN file_path VARCHAR(512) NULL;

ALTER TABLE school_public_documents
  ADD COLUMN kind VARCHAR(16) NULL DEFAULT 'file' AFTER school_organization_id;

ALTER TABLE school_public_documents
  ADD COLUMN link_url TEXT NULL AFTER file_path;

