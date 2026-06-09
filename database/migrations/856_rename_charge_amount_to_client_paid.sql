-- Migration 856: rename payroll_import_rows.charge_amount to client_paid_amount
-- An earlier revision of migration 855 created `charge_amount`. The column now
-- stores the billing report "Patient Amount Paid" value, so it must be named
-- `client_paid_amount` to match the application code. This migration is safe for
-- databases in any state: already renamed (no-op), has charge_amount (rename),
-- or has neither (add the column).

SET @has_client_paid := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payroll_import_rows'
    AND COLUMN_NAME = 'client_paid_amount'
);

SET @has_charge := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payroll_import_rows'
    AND COLUMN_NAME = 'charge_amount'
);

SET @sql := CASE
  WHEN @has_client_paid > 0 THEN 'SELECT 1'
  WHEN @has_charge > 0 THEN 'ALTER TABLE payroll_import_rows CHANGE COLUMN charge_amount client_paid_amount DECIMAL(12,2) NULL COMMENT ''Billing report Patient Amount Paid column (column AE in standard export)'''
  ELSE 'ALTER TABLE payroll_import_rows ADD COLUMN client_paid_amount DECIMAL(12,2) NULL COMMENT ''Billing report Patient Amount Paid column (column AE in standard export)'' AFTER amount_collected'
END;

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
