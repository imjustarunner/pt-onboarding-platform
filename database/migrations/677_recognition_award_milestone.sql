-- Milestone recognition: everyone whose period total for the chosen metric is >= threshold.

ALTER TABLE challenge_recognition_awards
  MODIFY COLUMN aggregation ENUM('most','average','milestone') NOT NULL DEFAULT 'most',
  ADD COLUMN milestone_threshold DECIMAL(14,4) NULL
    COMMENT 'When aggregation=milestone: minimum period total (units match metric) to earn the award'
    AFTER aggregation;
