-- Existing encrypted drawings remain readable. New board operations are indexed
-- by page and target, and retries are unique to the authenticated participant.
ALTER TABLE therapy_session_artifacts
  ADD COLUMN board_id BIGINT NULL,
  ADD COLUMN board_target_id BIGINT NULL,
  ADD COLUMN board_request_id CHAR(36) NULL,
  ADD INDEX idx_board_events (board_id, artifact_type, id),
  ADD INDEX idx_board_target (board_target_id, artifact_type, id),
  ADD UNIQUE INDEX uq_board_request (session_kind,session_id,generation,agency_id,actor,board_request_id);
