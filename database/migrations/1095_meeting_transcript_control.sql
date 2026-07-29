-- Migration 1095: transcript pause/stop control metadata for meetings + supervision

ALTER TABLE provider_schedule_event_artifacts
  ADD COLUMN transcript_stopped_at DATETIME NULL
  COMMENT 'When live transcription was permanently stopped';

ALTER TABLE provider_schedule_event_artifacts
  ADD COLUMN transcript_stopped_by_user_id INT NULL
  COMMENT 'User who stopped live transcription';

ALTER TABLE provider_schedule_event_artifacts
  ADD COLUMN transcript_stopped_by_name VARCHAR(255) NULL
  COMMENT 'Display name of who stopped live transcription';

ALTER TABLE provider_schedule_event_artifacts
  ADD COLUMN transcript_paused TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 when live transcription is paused';

ALTER TABLE supervision_session_artifacts
  ADD COLUMN transcript_stopped_at DATETIME NULL
  COMMENT 'When live transcription was permanently stopped';

ALTER TABLE supervision_session_artifacts
  ADD COLUMN transcript_stopped_by_user_id INT NULL
  COMMENT 'User who stopped live transcription';

ALTER TABLE supervision_session_artifacts
  ADD COLUMN transcript_stopped_by_name VARCHAR(255) NULL
  COMMENT 'Display name of who stopped live transcription';

ALTER TABLE supervision_session_artifacts
  ADD COLUMN transcript_paused TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 when live transcription is paused';
