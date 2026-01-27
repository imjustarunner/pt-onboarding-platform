-- Add primary provider tracking for client_provider_assignments.
-- Primary provider is used as the "main" provider shown in client UI.

ALTER TABLE client_provider_assignments
  ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT FALSE AFTER provider_user_id;

CREATE INDEX idx_client_provider_primary
  ON client_provider_assignments (client_id, is_primary);

-- Backfill: mark the legacy clients.provider_id assignment as primary (best-effort).
UPDATE client_provider_assignments cpa
JOIN clients c ON c.id = cpa.client_id
SET cpa.is_primary = TRUE
WHERE c.provider_id IS NOT NULL
  AND cpa.provider_user_id = c.provider_id;

