-- Migration 1190: Interview round label + display title for multi-round hiring interviews

ALTER TABLE hiring_interviews
  ADD COLUMN interview_round VARCHAR(32) NULL
    COMMENT 'initial|second|third|panel|final|reference|other',
  ADD COLUMN display_title VARCHAR(255) NULL
    COMMENT 'Calendar/list title; auto-built from round + candidate + job when scheduling';
