/*
Add intake/regular session type and weekly/biweekly frequency metadata
to provider_virtual_working_hours rows.
*/

ALTER TABLE provider_virtual_working_hours
  ADD COLUMN session_type VARCHAR(16) NOT NULL DEFAULT 'REGULAR' AFTER end_time;

ALTER TABLE provider_virtual_working_hours
  ADD COLUMN frequency VARCHAR(16) NOT NULL DEFAULT 'WEEKLY' AFTER session_type;

