-- Med Cancel schedule should be a 3-state contract setting: none/low/high.
-- Default existing NULLs to 'none' so UI logic is consistent.

UPDATE users
SET medcancel_rate_schedule = 'none'
WHERE medcancel_rate_schedule IS NULL;

