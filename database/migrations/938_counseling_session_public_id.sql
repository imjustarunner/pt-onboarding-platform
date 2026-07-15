-- Migration 938: Opaque public IDs for counseling session URLs (avoid guessable sequential IDs)
ALTER TABLE counseling_sessions
  ADD COLUMN public_id CHAR(36) NULL DEFAULT NULL
    COMMENT 'Opaque UUID used in shareable/app URLs instead of sequential id';

UPDATE counseling_sessions
SET public_id = UUID()
WHERE public_id IS NULL;

ALTER TABLE counseling_sessions
  MODIFY COLUMN public_id CHAR(36) NOT NULL;

CREATE UNIQUE INDEX uq_counseling_sessions_public_id
  ON counseling_sessions (public_id);
