-- Migration 867: EHR sync run log table
-- Tracks per-run outcomes of the ICS/EHR sync watchdog so admins can see
-- whether feeds are healthy and how many events were scanned or flagged.

CREATE TABLE IF NOT EXISTS office_ehr_sync_log (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  office_location_id INT NOT NULL,
  run_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  events_scanned        INT NOT NULL DEFAULT 0 COMMENT 'ASSIGNED_AVAILABLE + ASSIGNED_BOOKED events checked',
  events_booked         INT NOT NULL DEFAULT 0 COMMENT 'ASSIGNED_AVAILABLE events promoted to BOOKED',
  events_overlap_updated INT NOT NULL DEFAULT 0 COMMENT 'ASSIGNED_BOOKED events whose last_ics_overlap_at was refreshed',
  feeds_ok      INT NOT NULL DEFAULT 0,
  feeds_failed  INT NOT NULL DEFAULT 0,
  error_summary TEXT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ehr_sync_log_location_run (office_location_id, run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
