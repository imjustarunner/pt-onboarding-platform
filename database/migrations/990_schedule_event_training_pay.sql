-- Migration 990: Training/Mentorship/Onboarding flag for CPA / Provider Plus meetings
-- When set, creating/updating the meeting submits an Admin Time pay claim for approval.
ALTER TABLE provider_schedule_events
  ADD COLUMN is_training_pay_eligible TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'CPA/Provider Plus Training/Mentorship/Onboarding — submits Admin Time pay claim';
