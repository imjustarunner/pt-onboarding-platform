-- Migration 1124: retain who closed a team meeting / huddle.
-- meeting_completed_at already records when; this makes the closure audit
-- durable even if the event is edited later by another administrator.

ALTER TABLE provider_schedule_events
  ADD COLUMN meeting_completed_by_user_id INT NULL DEFAULT NULL
  COMMENT 'User who closed the live team meeting or huddle'
  AFTER meeting_completed_at;

UPDATE provider_schedule_events
SET meeting_completed_by_user_id = updated_by_user_id
WHERE meeting_completed_at IS NOT NULL
  AND meeting_completed_by_user_id IS NULL;

CREATE INDEX idx_pse_meeting_completed_by
  ON provider_schedule_events (meeting_completed_by_user_id);

ALTER TABLE provider_schedule_events
  ADD CONSTRAINT fk_pse_meeting_completed_by
  FOREIGN KEY (meeting_completed_by_user_id) REFERENCES users(id)
  ON DELETE SET NULL;
