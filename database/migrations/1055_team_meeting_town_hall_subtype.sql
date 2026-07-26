-- Migration 1055: Allow town_hall meeting subtype (Admin Meeting / Town Hall / general)
ALTER TABLE provider_schedule_events
  MODIFY COLUMN meeting_subtype VARCHAR(32) NOT NULL DEFAULT 'general'
  COMMENT 'general | admin | town_hall — admin/town_hall restricted to super_admin/admin/support creators';
