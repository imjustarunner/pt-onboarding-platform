-- Migration 937: Guest invite token for sharing counseling video sessions without a pre-assigned client
ALTER TABLE counseling_sessions
  ADD COLUMN guest_invite_token VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Shareable join token for inviting a client later',
  ADD COLUMN guest_invite_expires_at DATETIME NULL DEFAULT NULL
    COMMENT 'Optional expiry for guest invite token';

CREATE UNIQUE INDEX uq_counseling_sessions_guest_token
  ON counseling_sessions (guest_invite_token);
