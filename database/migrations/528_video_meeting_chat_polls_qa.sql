/*
Video meeting chat, polls, and Q&A with persistence for meeting owners.

Purpose:
- Store in-meeting chat messages sent via Twilio DataTrack (also POSTed to backend for persistence).
- Store polls (host creates) and poll responses (participants vote).
- Store Q&A (questions and answers) for later review by meeting owner.
- Supports both supervision sessions (session_id) and team meetings (event_id).
- Meeting owner (supervisor or event provider) can access all activity after the meeting ends.
*/

CREATE TABLE IF NOT EXISTS video_meeting_activity (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NULL COMMENT 'supervision_sessions.id when supervision',
  event_id INT NULL COMMENT 'provider_schedule_events.id when team meeting',
  user_id INT NULL COMMENT 'users.id when known (from participant identity user-N)',
  participant_identity VARCHAR(255) NOT NULL COMMENT 'Twilio identity e.g. user-123',
  activity_type VARCHAR(32) NOT NULL COMMENT 'chat|poll|poll_vote|question|answer',
  payload_json JSON NOT NULL COMMENT '{"text":"..."} for chat, {"question","options":[]} for poll, etc',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_vma_session (session_id),
  INDEX idx_vma_event (event_id),
  INDEX idx_vma_created (created_at),
  CONSTRAINT chk_vma_source CHECK (
    (session_id IS NOT NULL AND event_id IS NULL) OR
    (session_id IS NULL AND event_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
