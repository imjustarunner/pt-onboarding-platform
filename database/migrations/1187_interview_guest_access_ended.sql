-- Migration 1187: End Interview — lock guest/interviewee access while interviewers stay
ALTER TABLE hiring_interviews
  ADD COLUMN guest_access_ended_at DATETIME NULL DEFAULT NULL
    COMMENT 'When interviewee join access was ended (interviewers may still be in the room)',
  ADD COLUMN guest_access_ended_by_user_id INT NULL DEFAULT NULL
    COMMENT 'User who ended guest access';
