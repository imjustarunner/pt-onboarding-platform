-- Migration 869: add TUTORING to scheduling_service_codes and credential eligibility
INSERT INTO scheduling_service_codes (code, label, is_billable, default_note_type)
VALUES ('TUTORING', 'Tutoring Session', 1, NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Allow all credential tiers to bill TUTORING sessions
INSERT INTO credential_service_code_eligibility (credential_tier, service_code, allowed)
VALUES
  ('qbha',        'TUTORING', 1),
  ('bachelors',   'TUTORING', 1),
  ('intern_plus', 'TUTORING', 1)
ON DUPLICATE KEY UPDATE allowed = 1;
