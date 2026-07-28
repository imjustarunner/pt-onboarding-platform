-- Migration 1081: harden users.role guards against clinician regression
-- Separate from 1080 so the migration runner executes CREATE TRIGGER correctly.

DROP TRIGGER IF EXISTS trg_users_block_clinician_regression;
DROP TRIGGER IF EXISTS trg_users_block_clinician_insert;
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

CREATE TRIGGER trg_users_block_clinician_regression
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  IF LOWER(COALESCE(NEW.role, '')) = 'clinician' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Blocked: clinician role is permanently retired (migration 1080/1081). Use provider/athlete/school_staff/client_guardian.';
  END IF;
END;

CREATE TRIGGER trg_users_block_clinician_insert
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
  IF LOWER(COALESCE(NEW.role, '')) = 'clinician' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Blocked: clinician role is permanently retired (migration 1080/1081). Use provider/athlete/school_staff/client_guardian.';
  END IF;
END;
