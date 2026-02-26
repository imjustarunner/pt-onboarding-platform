-- Migration: Client termination with required reason
-- Description: Adds termination_reason, terminated_at, terminated_by_user_id to clients.
--              Re-activates the 'terminated' client_status so support staff and providers
--              can move clients to terminated (with a required reason).

-- 1) Add termination columns to clients
ALTER TABLE clients
  ADD COLUMN termination_reason TEXT NULL COMMENT 'Required when client_status_id is terminated',
  ADD COLUMN terminated_at TIMESTAMP NULL,
  ADD COLUMN terminated_by_user_id INT NULL,
  ADD CONSTRAINT fk_clients_terminated_by FOREIGN KEY (terminated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2) Re-activate terminated status (migration 278 deactivated it)
UPDATE client_statuses
SET is_active = TRUE
WHERE status_key = 'terminated';

-- 3) Ensure agencies without terminated status get one; reactivate if deactivated
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'terminated', 'Terminated', 'Services ended, client terminated.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM client_statuses cs
    WHERE cs.agency_id = a.id AND cs.status_key = 'terminated'
  )
ON DUPLICATE KEY UPDATE is_active = TRUE, label = VALUES(label);
