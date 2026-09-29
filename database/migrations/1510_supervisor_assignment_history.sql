-- Current assignments confer access. Historical assignments live separately and
-- never participate in roster, signing, chat-group, or authorization queries.
-- Snapshots have no cascading foreign keys so names and dates survive offboarding.
CREATE TABLE IF NOT EXISTS supervisor_assignment_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  supervisor_id INT NOT NULL,
  supervisee_id INT NOT NULL,
  agency_id INT NOT NULL,
  supervisor_type VARCHAR(32) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id INT NULL,
  assigned_at DATETIME NULL,
  ended_at DATETIME NOT NULL,
  end_reason VARCHAR(40) NOT NULL,
  supervisor_name VARCHAR(255) NULL,
  supervisee_name VARCHAR(255) NULL,
  agency_name VARCHAR(255) NULL,
  INDEX idx_supervision_history_supervisee (supervisee_id, agency_id, ended_at),
  INDEX idx_supervision_history_supervisor (supervisor_id, agency_id, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS supervisor_assignment_preserve_deleted;
CREATE TRIGGER supervisor_assignment_preserve_deleted
BEFORE DELETE ON supervisor_assignments FOR EACH ROW
BEGIN
  INSERT INTO supervisor_assignment_history (assignment_id, supervisor_id, supervisee_id, agency_id, supervisor_type, is_primary, created_by_user_id, assigned_at, ended_at, end_reason, supervisor_name, supervisee_name, agency_name)
    SELECT OLD.id, OLD.supervisor_id, OLD.supervisee_id, OLD.agency_id,
           OLD.supervisor_type, OLD.is_primary, OLD.created_by_user_id,
           OLD.created_at, UTC_TIMESTAMP(), IF(EXISTS (SELECT 1 FROM users u WHERE u.id IN (OLD.supervisor_id, OLD.supervisee_id) AND (COALESCE(u.is_active, 1) = 0 OR COALESCE(u.is_archived, 0) = 1 OR UPPER(COALESCE(u.status, '')) IN ('INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'TERMINATED_PENDING'))), 'account_inactive', 'unassigned'),
           TRIM(CONCAT_WS(' ', s.first_name, s.last_name)),
           TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), a.name
    FROM users s JOIN users e ON e.id = OLD.supervisee_id
    JOIN agencies a ON a.id = OLD.agency_id
    WHERE s.id = OLD.supervisor_id;
END;

DROP TRIGGER IF EXISTS supervisor_assignment_preserve_replaced;
CREATE TRIGGER supervisor_assignment_preserve_replaced
BEFORE UPDATE ON supervisor_assignments FOR EACH ROW
BEGIN
  IF OLD.supervisor_id <> NEW.supervisor_id OR OLD.supervisee_id <> NEW.supervisee_id
     OR OLD.agency_id <> NEW.agency_id OR OLD.supervisor_type <> NEW.supervisor_type THEN
    INSERT INTO supervisor_assignment_history (assignment_id, supervisor_id, supervisee_id, agency_id, supervisor_type, is_primary, created_by_user_id, assigned_at, ended_at, end_reason, supervisor_name, supervisee_name, agency_name)
    SELECT OLD.id, OLD.supervisor_id, OLD.supervisee_id, OLD.agency_id,
           OLD.supervisor_type, OLD.is_primary, OLD.created_by_user_id,
           OLD.created_at, UTC_TIMESTAMP(), 'reassigned',
           TRIM(CONCAT_WS(' ', s.first_name, s.last_name)),
           TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), a.name
    FROM users s JOIN users e ON e.id = OLD.supervisee_id
    JOIN agencies a ON a.id = OLD.agency_id
    WHERE s.id = OLD.supervisor_id;
    SET NEW.created_at = UTC_TIMESTAMP();
  END IF;
END;

-- Cover every status-update path, including scheduled archiving and direct edits.
-- Both archive and removal roll back together if the user update is rolled back.
DROP TRIGGER IF EXISTS user_end_inactive_supervision;
CREATE TRIGGER user_end_inactive_supervision AFTER UPDATE ON users FOR EACH ROW
BEGIN
  IF COALESCE(NEW.is_active, 1) = 0 OR COALESCE(NEW.is_archived, 0) = 1
     OR UPPER(COALESCE(NEW.status, '')) IN ('INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'TERMINATED_PENDING') THEN
    DELETE FROM supervisor_assignments WHERE supervisor_id = NEW.id OR supervisee_id = NEW.id;
  END IF;
END;

DROP TRIGGER IF EXISTS supervisor_assignment_active_insert;
CREATE TRIGGER supervisor_assignment_active_insert BEFORE INSERT ON supervisor_assignments FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM users u WHERE u.id IN (NEW.supervisor_id, NEW.supervisee_id) AND (COALESCE(u.is_active, 1) = 0 OR COALESCE(u.is_archived, 0) = 1 OR UPPER(COALESCE(u.status, '')) IN ('INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'TERMINATED_PENDING'))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inactive users cannot have current supervisor assignments';
  END IF;
END;

DROP TRIGGER IF EXISTS supervisor_assignment_active_update;
CREATE TRIGGER supervisor_assignment_active_update BEFORE UPDATE ON supervisor_assignments FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM users u WHERE u.id IN (NEW.supervisor_id, NEW.supervisee_id) AND (COALESCE(u.is_active, 1) = 0 OR COALESCE(u.is_archived, 0) = 1 OR UPPER(COALESCE(u.status, '')) IN ('INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'TERMINATED_PENDING'))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inactive users cannot have current supervisor assignments';
  END IF;
END;

-- Repair existing inactive rosters through the archival trigger. ended_at is
-- when the assignment was removed, not an inferred past employment end date.
DELETE sa FROM supervisor_assignments sa
JOIN users s ON s.id = sa.supervisor_id
JOIN users e ON e.id = sa.supervisee_id
WHERE (COALESCE(s.is_active, 1) = 0 OR COALESCE(s.is_archived, 0) = 1 OR UPPER(COALESCE(s.status, '')) IN ('INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'TERMINATED_PENDING'))
   OR (COALESCE(e.is_active, 1) = 0 OR COALESCE(e.is_archived, 0) = 1 OR UPPER(COALESCE(e.status, '')) IN ('INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'TERMINATED_PENDING'));
