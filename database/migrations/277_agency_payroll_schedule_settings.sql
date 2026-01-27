-- Payroll: per-agency payroll schedule settings
-- Allows agencies to define how pay periods are generated and detected (biweekly vs semi-monthly),
-- and ensures we keep a minimum number of future draft pay periods available.

CREATE TABLE IF NOT EXISTS agency_payroll_schedule_settings (
  agency_id INT NOT NULL,
  schedule_type ENUM('biweekly','semi_monthly') NOT NULL DEFAULT 'biweekly',

  -- Biweekly: anchor to a known pay period end date; subsequent periods are every 14 days.
  biweekly_anchor_period_end DATE NULL,

  -- Semi-monthly: end dates within each month (day numbers). If day exceeds month length, clamp to last day.
  semi_monthly_day1 TINYINT UNSIGNED NOT NULL DEFAULT 15,
  semi_monthly_day2 TINYINT UNSIGNED NOT NULL DEFAULT 30,

  -- Keep at least this many future pay period drafts created.
  future_draft_count INT NOT NULL DEFAULT 6,

  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (agency_id),
  CONSTRAINT fk_apss_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_apss_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

