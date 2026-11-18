-- Pin the chosen guide to its job. Creating or editing another set must not
-- silently replace that job's default. Preserve the guide previously selected
-- by the legacy most-recent-set rule; interview artifacts are unchanged.
ALTER TABLE hiring_job_descriptions ADD COLUMN interview_question_set_id BIGINT NULL;

UPDATE hiring_job_descriptions job
SET interview_question_set_id = (
  SELECT questions.id FROM interview_hub_job_question_sets questions
  WHERE questions.agency_id = job.agency_id
    AND questions.job_description_id = job.id AND questions.is_active = 1
  ORDER BY questions.updated_at DESC, questions.id DESC LIMIT 1
), updated_at = job.updated_at
WHERE interview_question_set_id IS NULL
  AND EXISTS (SELECT 1 FROM interview_hub_job_question_sets questions
    WHERE questions.agency_id=job.agency_id AND questions.job_description_id=job.id AND questions.is_active=1);
