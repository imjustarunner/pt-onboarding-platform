-- Migration 1052: Team meeting subtype (general | admin)
ALTER TABLE provider_schedule_events
  ADD COLUMN meeting_subtype VARCHAR(32) NOT NULL DEFAULT 'general'
  COMMENT 'general | admin — Admin Meeting restricted to super_admin/admin/support creators';

CREATE INDEX idx_pse_meeting_subtype_start
  ON provider_schedule_events (meeting_subtype, start_at);
