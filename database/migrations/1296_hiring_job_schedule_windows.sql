-- Migration 1296: schedule job postings publish/unpublish windows (UTC)
-- Wall times are converted using agencies.timezone on write; public visibility is evaluated at read time.

ALTER TABLE hiring_job_descriptions
  ADD COLUMN publish_at DATETIME NULL
    COMMENT 'UTC instant when posting becomes visible on public careers (NULL = immediately if active)',
  ADD COLUMN unpublish_at DATETIME NULL
    COMMENT 'UTC instant when posting is hidden from public careers (NULL = no auto take-down)';
