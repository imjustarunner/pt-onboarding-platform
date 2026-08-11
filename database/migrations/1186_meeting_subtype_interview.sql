-- Migration 1186: Document interview as a valid meeting_subtype value
ALTER TABLE provider_schedule_events
  MODIFY COLUMN meeting_subtype VARCHAR(32) NOT NULL DEFAULT 'general'
  COMMENT 'general | admin | town_hall | interview — admin/town_hall restricted to super_admin/admin/support creators; interview used by Interview Hub';
