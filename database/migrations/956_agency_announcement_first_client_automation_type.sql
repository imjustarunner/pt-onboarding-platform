-- Migration 956: allow first-client anniversary automation runs
ALTER TABLE agency_announcement_automation_runs
  MODIFY COLUMN automation_type ENUM(
    'birthday',
    'anniversary',
    'first_client_anniversary'
  ) NOT NULL;
