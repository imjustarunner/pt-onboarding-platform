-- Migration 896: Add audit_trail to tasks table
-- The prehire portal records consent and intent acknowledgments here
-- before the document is signed (signed_documents.audit_trail captures post-sign state).
ALTER TABLE tasks
  ADD COLUMN audit_trail JSON NULL DEFAULT NULL
    COMMENT 'Consent, intent, and identity binding records from prehire portal';
