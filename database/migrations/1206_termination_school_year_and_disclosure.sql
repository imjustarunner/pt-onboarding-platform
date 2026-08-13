-- Migration 1206: Termination school year + auto-clear disclosure for continuing school clients

ALTER TABLE clients
  ADD COLUMN termination_school_year VARCHAR(16) NULL
  COMMENT 'School year (YYYY-YYYY) when client was terminated — used for roster year filtering';

-- Backfill termination year from school_year for existing terminated clients
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
SET c.termination_school_year = TRIM(c.school_year)
WHERE LOWER(cs.status_key) = 'terminated'
  AND c.termination_school_year IS NULL
  AND c.school_year IS NOT NULL
  AND TRIM(c.school_year) <> '';

-- Continuing school clients: disclosures are current in-system — do not require manual re-check
UPDATE clients c
LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
SET c.disclosure_required = 0
WHERE c.client_type = 'school'
  AND LOWER(COALESCE(cs.status_key, '')) NOT IN (
    'received', 'packet', 'pending_corrections', 'in_process', 'screener',
    'waitlist', 'terminated', 'archived'
  );
