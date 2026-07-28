-- Migration 1067: default supervision attendees to optional (mandatory is opt-in for group sessions)
ALTER TABLE supervision_session_attendees
  MODIFY COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1=mandatory attendee, 0=optional';
