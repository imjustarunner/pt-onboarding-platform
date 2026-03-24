-- Per-session activity options for Clinical Aid (H2014). When rows exist for a session, only those are used;
-- otherwise group-level options (session_id NULL) apply.

ALTER TABLE skill_builders_activity_options
  ADD COLUMN session_id INT NULL DEFAULT NULL
    COMMENT 'FK skill_builders_event_sessions.id per occurrence, or NULL for group-wide'
    AFTER skills_group_id,
  ADD INDEX idx_sb_actopt_session (session_id),
  ADD CONSTRAINT fk_sb_actopt_session
    FOREIGN KEY (session_id) REFERENCES skill_builders_event_sessions(id) ON DELETE CASCADE;
