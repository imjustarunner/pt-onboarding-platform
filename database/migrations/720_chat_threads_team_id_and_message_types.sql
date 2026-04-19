-- Migration: link chat_threads to teams and broaden thread_type for team / club threads
--
-- A "team thread" is a persistent group conversation tied to a single
-- challenge_teams row. A "club thread" is a club-wide conversation keyed by
-- agency_id with team_id IS NULL and thread_type = 'club'.
--
-- thread_type stays VARCHAR(50) (the column is already a string), so this is
-- purely an additive change. Existing direct/group threads keep working.

ALTER TABLE chat_threads
  ADD COLUMN team_id INT NULL AFTER thread_type,
  ADD INDEX idx_chat_threads_agency_team (agency_id, team_id),
  ADD INDEX idx_chat_threads_team (team_id),
  ADD CONSTRAINT fk_chat_threads_team
    FOREIGN KEY (team_id) REFERENCES challenge_teams(id) ON DELETE SET NULL;
