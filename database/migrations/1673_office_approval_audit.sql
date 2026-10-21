-- Shared office approvals retain the original request IDs and audit every source.
SET @office_audit_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_audit_log' AND COLUMN_NAME='action_type');
SET @office_audit_sql = IF(@office_audit_type LIKE 'enum(%' AND LOCATE('OFFICE_REQUEST_DECIDED',@office_audit_type)=0,
  CONCAT('ALTER TABLE admin_audit_log MODIFY COLUMN action_type ',LEFT(@office_audit_type,LENGTH(@office_audit_type)-1),",'OFFICE_REQUEST_DECIDED') NOT NULL"),
  'SELECT 1');
PREPARE office_audit_stmt FROM @office_audit_sql;
EXECUTE office_audit_stmt;
DEALLOCATE PREPARE office_audit_stmt;
