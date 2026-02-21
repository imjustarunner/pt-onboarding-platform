-- Track how many times a TEMPORARY assignment has been extended (max 2).
-- After 2 extensions, when temporary_until_date passes, the slot falls off and provider must re-request.

ALTER TABLE office_standing_assignments
  ADD COLUMN temporary_extension_count TINYINT NOT NULL DEFAULT 0
    COMMENT 'Number of 6-week extensions used, max 2 for request-based assignments'
    AFTER temporary_until_date;
