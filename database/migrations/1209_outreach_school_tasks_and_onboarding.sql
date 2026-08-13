-- Migration 1209: tag tasks to outreach schools and link school onboarding invites

ALTER TABLE tasks
  ADD COLUMN outreach_school_id INT NULL DEFAULT NULL
  COMMENT 'Outreach directory school this task is tagged to';

CREATE INDEX idx_tasks_outreach_school ON tasks (outreach_school_id);

ALTER TABLE school_onboarding_invites
  ADD COLUMN outreach_school_id INT NULL DEFAULT NULL
  COMMENT 'Outreach directory school this invite was sent from';

CREATE INDEX idx_soi_outreach_school ON school_onboarding_invites (outreach_school_id);
