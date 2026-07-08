-- Migration 898 users role change guard and audit tripwire
-- The users role column was collapsed to the deprecated clinician role by a
-- direct out of band DB operation that bypassed the app and left no
-- admin_audit_log entries. A pre existing BEFORE UPDATE trigger that protects
-- superadmin still failed to protect it which proves the change bypassed
-- UPDATE triggers and was a table level restore or bulk import.
-- This migration adds
--   1 an audit table plus AFTER UPDATE trigger recording every role change with
--     the connecting DB account via USER so any future change is attributable
--   2 a BEFORE UPDATE trigger blocking reassignment to the deprecated clinician
--     role which is the exact signature of the collapse
--   3 a BEFORE INSERT trigger blocking inserts with the clinician role which
--     covers the REPLACE INTO and LOAD DATA and import vectors
-- The application never writes clinician because it normalizes clinician to
-- provider so these guards cannot break any legitimate flow. Existing clinician
-- rows are untouched and reclassifying them away from clinician is allowed.

CREATE TABLE IF NOT EXISTS users_role_change_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  old_role VARCHAR(64) NULL,
  new_role VARCHAR(64) NULL,
  db_user VARCHAR(255) NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_urca_user (user_id),
  INDEX idx_urca_changed_at (changed_at)
);

DROP TRIGGER IF EXISTS trg_users_role_change_audit;

CREATE TRIGGER trg_users_role_change_audit
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  IF NOT (OLD.role <=> NEW.role) THEN
    INSERT INTO users_role_change_audit (user_id, old_role, new_role, db_user)
    VALUES (NEW.id, OLD.role, NEW.role, USER());
  END IF;
END;

DROP TRIGGER IF EXISTS trg_users_block_clinician_regression;

CREATE TRIGGER trg_users_block_clinician_regression
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  IF NEW.role = 'clinician' AND (OLD.role IS NULL OR OLD.role <> 'clinician') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Blocked reassigning a user to the deprecated clinician role is not allowed (role-collapse guard migration 898)';
  END IF;
END;

DROP TRIGGER IF EXISTS trg_users_block_clinician_insert;

CREATE TRIGGER trg_users_block_clinician_insert
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
  IF NEW.role = 'clinician' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Blocked inserting a user with the deprecated clinician role is not allowed (role-collapse guard migration 898)';
  END IF;
END;
