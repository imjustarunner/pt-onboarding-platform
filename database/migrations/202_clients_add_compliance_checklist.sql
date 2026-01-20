-- Migration: Client compliance checklist fields + audit info
-- Description: Track outreach/intake/first service dates (non-clinical operational checklist).

ALTER TABLE clients
  ADD COLUMN parents_contacted_at DATE NULL AFTER cleared_to_start,
  ADD COLUMN parents_contacted_successful TINYINT(1) NULL AFTER parents_contacted_at,
  ADD COLUMN intake_at DATE NULL AFTER parents_contacted_successful,
  ADD COLUMN first_service_at DATE NULL AFTER intake_at,
  ADD COLUMN checklist_updated_by_user_id INT NULL AFTER first_service_at,
  ADD COLUMN checklist_updated_at DATETIME NULL AFTER checklist_updated_by_user_id,
  ADD CONSTRAINT fk_clients_checklist_updated_by FOREIGN KEY (checklist_updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD INDEX idx_clients_checklist_updated_at (checklist_updated_at);

