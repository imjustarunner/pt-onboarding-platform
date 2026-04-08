-- Optional reference amount (miles/points/etc.) for display and season config.
-- Not used in SQL winner logic except milestone_threshold (milestone aggregation).

ALTER TABLE challenge_recognition_awards
  ADD COLUMN reference_target DECIMAL(14,4) NULL
    COMMENT 'Optional amount in metric units for most/average (display only). Milestone awards use milestone_threshold.'
    AFTER milestone_threshold;
