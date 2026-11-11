-- Both Stedi products share the durable paid-request ledger and coverage hold.
SET @stedi_kind_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='stedi_insurance_discoveries' AND column_name='request_kind')=0,
  'ALTER TABLE stedi_insurance_discoveries ADD COLUMN request_kind VARCHAR(24) NOT NULL DEFAULT ''discovery''',
  'SELECT 1'
);
PREPARE stedi_kind_stmt FROM @stedi_kind_sql;
EXECUTE stedi_kind_stmt;
DEALLOCATE PREPARE stedi_kind_stmt;
