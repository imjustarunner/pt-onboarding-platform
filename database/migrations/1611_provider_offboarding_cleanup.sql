-- Archive/status changes and their cleanup request commit together, including
-- legacy admin endpoints and the automatic termination-status processor.
CREATE TABLE provider_offboarding_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  actor_user_id INT NULL,
  cutoff_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  schedule_cleaned_at DATETIME NULL,
  completed_at DATETIME NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error_code VARCHAR(100) NULL,
  summary_json JSON NULL,
  pending_provider_id INT GENERATED ALWAYS AS (CASE WHEN completed_at IS NULL THEN provider_id ELSE NULL END) STORED,
  UNIQUE KEY one_pending_provider_cleanup (pending_provider_id),
  KEY pending_provider_cleanup (completed_at,id)
) ENGINE=InnoDB;
CREATE TABLE provider_offboarding_items (
  job_id BIGINT UNSIGNED NOT NULL,
  item_kind ENUM('appointment','office_calendar') NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  snapshot_json JSON NOT NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (job_id,item_kind,item_id),
  FOREIGN KEY (job_id) REFERENCES provider_offboarding_jobs(id)
) ENGINE=InnoDB;
CREATE TRIGGER user_archive_disable_access BEFORE UPDATE ON users
FOR EACH ROW SET
  NEW.is_active = IF(NEW.is_archived=1 OR UPPER(COALESCE(NEW.status,'')) IN ('ARCHIVED','INACTIVE_EMPLOYEE'),0,NEW.is_active),
  NEW.provider_accepting_new_clients = IF(NEW.is_archived=1 OR UPPER(COALESCE(NEW.status,'')) IN ('ARCHIVED','INACTIVE_EMPLOYEE'),0,NEW.provider_accepting_new_clients);
CREATE TRIGGER user_archive_queue_provider_cleanup AFTER UPDATE ON users
FOR EACH ROW INSERT IGNORE INTO provider_offboarding_jobs (provider_id,actor_user_id)
SELECT NEW.id,NEW.archived_by_user_id
WHERE (NEW.is_archived=1 OR UPPER(COALESCE(NEW.status,'')) IN ('ARCHIVED','INACTIVE_EMPLOYEE'))
  AND (NEW.role IN ('provider','provider_plus','intern','intern_plus','facilitator','qbha','supervisor','clinical_practice_assistant','admin','super_admin','superadmin','staff','support') OR NEW.has_provider_access=1)
  AND NOT (COALESCE(OLD.is_archived,0)=1 OR UPPER(COALESCE(OLD.status,'')) IN ('ARCHIVED','INACTIVE_EMPLOYEE'));
-- Include already archived/inactive accounts. No client record, note, visit, or
-- claim is deleted; the worker only removes operational assignments and future work.
INSERT IGNORE INTO provider_offboarding_jobs (provider_id,actor_user_id)
SELECT id,archived_by_user_id FROM users
WHERE (is_archived=1 OR UPPER(COALESCE(status,'')) IN ('ARCHIVED','INACTIVE_EMPLOYEE'))
  AND (role IN ('provider','provider_plus','intern','intern_plus','facilitator','qbha','supervisor','clinical_practice_assistant','admin','super_admin','superadmin','staff','support') OR has_provider_access=1);
