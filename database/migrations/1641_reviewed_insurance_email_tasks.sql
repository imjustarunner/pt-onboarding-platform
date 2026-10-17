-- No missing-card email is sent without a billing staff member reviewing it.
UPDATE insurance_card_reminder_settings SET enabled=0;

CREATE TABLE IF NOT EXISTS insurance_card_staff_reminders (
  profile_id BIGINT NOT NULL,
  cycle_hash CHAR(64) NOT NULL,
  user_id INT NOT NULL,
  snoozed_until DATETIME NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id, cycle_hash, user_id)
);

ALTER TABLE insurance_card_deliveries
  ADD COLUMN reviewed_by_user_id INT NULL,
  ADD COLUMN reviewed_content_hash CHAR(64) NULL;

-- Explicit exclusions persist independently of clinical-feature flags.
UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.billingAccountExcluded',TRUE)
WHERE LOWER(name) REGEXP '(^|[^a-z])demo([^a-z]|$)'
   OR LOWER(slug) REGEXP '(^|-)demo(-|$)'
   OR slug IN ('d11summer','d11-summer-itsco','itsco-book-club');
