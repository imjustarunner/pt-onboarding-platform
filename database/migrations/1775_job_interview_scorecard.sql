-- Questions and rating criteria share the job's interview guide. NULL inherits
-- the agency template, which falls back to the platform criteria.
ALTER TABLE interview_hub_job_question_sets ADD COLUMN scorecard_criteria_json JSON NULL;
