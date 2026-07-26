-- Migration 1053: Goals / action items workspace on team meeting artifacts
ALTER TABLE provider_schedule_event_artifacts
  ADD COLUMN focus_title VARCHAR(500) NULL
  COMMENT 'Optional focus title for the meeting workspace';

ALTER TABLE provider_schedule_event_artifacts
  ADD COLUMN goals_json JSON NULL
  COMMENT 'Array of {id,text,done} meeting goals';

ALTER TABLE provider_schedule_event_artifacts
  ADD COLUMN action_items_json JSON NULL
  COMMENT 'Array of {id,text,done,assigneeUserId?,isEscalation?,escalationTicketId?}';
