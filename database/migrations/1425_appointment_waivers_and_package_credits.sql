-- Existing entitlements keep their balances; new allowances are never inferred retroactively.
ALTER TABLE booking_package_entitlements
  ADD COLUMN free_misses_remaining INT NOT NULL DEFAULT 0,
  ADD COLUMN bonus_sessions_remaining INT NOT NULL DEFAULT 0 COMMENT 'Subset of sessions_remaining',
  ADD COLUMN bonus_sessions_reserved INT NOT NULL DEFAULT 0 COMMENT 'Subset of sessions_reserved';

CREATE TABLE appointment_change_waivers (
  appointment_id INT UNSIGNED NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  requested_by_user_id INT NOT NULL,
  request_reason VARCHAR(1000) NOT NULL,
  request_comment TEXT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  decision VARCHAR(16) NULL,
  decision_reason VARCHAR(1000) NULL,
  decided_by_user_id INT NULL,
  decided_at DATETIME NULL,
  adjustment_json JSON NULL,
  addendum LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_change_waiver_queue (agency_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve recommendations signed before the review queue was available.
INSERT INTO appointment_change_waivers
  (appointment_id, agency_id, requested_by_user_id, request_reason, request_comment)
SELECT appointment_id, agency_id, signed_by_user_id,
       LEFT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(facts_json, '$.waiver.reason')), 'Review requested'), 1000),
       JSON_UNQUOTE(JSON_EXTRACT(facts_json, '$.waiver.comment'))
FROM appointment_change_workflows
WHERE status = 'completed' AND signed_by_user_id IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(facts_json, '$.waiver.action')) = 'recommend'
  AND JSON_UNQUOTE(JSON_EXTRACT(preview_json, '$.consequence.model')) IN ('fee', 'package');
