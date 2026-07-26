-- Migration 1049: Persist individual supervision live-session workspace
-- (session focus, goals, action items, private notes) on session artifacts
-- so My Dashboard / Supervision tab can show them after the session.

ALTER TABLE supervision_session_artifacts
  ADD COLUMN focus_title VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'Individual supervision session focus title',
  ADD COLUMN goals_json JSON NULL
    COMMENT 'Array of {id,text,done} goals for the session',
  ADD COLUMN action_items_json JSON NULL
    COMMENT 'Array of {id,text,done} action items for the session',
  ADD COLUMN private_notes_text LONGTEXT NULL
    COMMENT 'Private session summary notes written during the live session';
