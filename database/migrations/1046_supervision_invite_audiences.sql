-- Migration 1046: agency-wide supervision invite audiences for group sessions
ALTER TABLE supervision_sessions
  ADD COLUMN invite_audience_all_supervised TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Open join: anyone prelicensed/supervised in this agency',
  ADD COLUMN invite_audience_group_support TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Open join: anyone with group supervision hour requirements in this agency';
