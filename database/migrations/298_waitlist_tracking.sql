-- Migration: Waitlist tracking (days + rank)
-- Description: Adds waitlist_started_at to clients so we can compute days waitlisted and per-school rank.

ALTER TABLE clients
  ADD COLUMN waitlist_started_at DATE NULL COMMENT 'Date client entered waitlist (for school-scoped rank + days waitlisted)';

-- Helpful index for waitlist ordering queries/reporting
CREATE INDEX idx_clients_waitlist_started
  ON clients (client_status_id, waitlist_started_at, id);

-- Backfill: for existing waitlist clients, approximate waitlist start from submission_date
-- (improves immediate usefulness without requiring manual updates).
UPDATE clients c
JOIN client_statuses cs ON cs.id = c.client_status_id
SET c.waitlist_started_at = COALESCE(c.waitlist_started_at, c.submission_date)
WHERE LOWER(COALESCE(cs.status_key,'')) = 'waitlist'
  AND c.waitlist_started_at IS NULL
  AND c.submission_date IS NOT NULL;

