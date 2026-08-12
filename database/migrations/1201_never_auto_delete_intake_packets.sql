-- Migration 1201: never auto-delete intake packets or attached PHI
-- Completed packets are a client record. Do not expire or purge them on a timer.

UPDATE platform_retention_settings
SET default_intake_retention_mode = 'never',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

UPDATE intake_submissions
SET retention_expires_at = NULL
WHERE retention_expires_at IS NOT NULL;

UPDATE client_phi_documents
SET expires_at = NULL
WHERE expires_at IS NOT NULL;
