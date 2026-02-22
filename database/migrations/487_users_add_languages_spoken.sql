-- Add languages_spoken to users (account area field).
-- Plain SQL compatible with mysql2 prepared statements (no PREPARE/EXECUTE).

ALTER TABLE users
  ADD COLUMN languages_spoken VARCHAR(255) NULL;
