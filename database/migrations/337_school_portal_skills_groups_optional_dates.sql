-- School Portal: allow Skills Groups without date range.
-- Admin UI can still enforce required dates, but the School Portal should not.

ALTER TABLE skills_groups
  MODIFY COLUMN start_date DATE NULL,
  MODIFY COLUMN end_date DATE NULL;

