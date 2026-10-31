-- Optional provider contact plans. The application limits this first rollout to
-- the existing ITSCOLLC QA demo; no production provider is enrolled by migration.
CREATE TABLE IF NOT EXISTS school_provider_contact_plans (
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'unconfigured',
  template TEXT NOT NULL,
  sms_after_days INT NOT NULL DEFAULT 3,
  email_after_days INT NOT NULL DEFAULT 7,
  stale_after_hours INT NOT NULL DEFAULT 72,
  decided_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, provider_user_id),
  CONSTRAINT fk_school_contact_plan_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_contact_plan_provider FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
