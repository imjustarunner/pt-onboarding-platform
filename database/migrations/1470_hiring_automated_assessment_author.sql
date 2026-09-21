-- Automated assessments have no human author; preserve attribution on existing reports.
ALTER TABLE hiring_research_reports MODIFY COLUMN created_by_user_id INT NULL;
