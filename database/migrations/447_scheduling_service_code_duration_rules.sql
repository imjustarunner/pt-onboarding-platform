-- Scheduling service code duration policy support.
-- Enables hard minimum durations (e.g., 90837 must be >= 53 minutes).

ALTER TABLE scheduling_service_codes
  ADD COLUMN min_duration_minutes INT NULL AFTER default_note_type;

-- Ensure psychotherapy codes exist and carry duration requirements.
INSERT IGNORE INTO scheduling_service_codes (code, label, is_billable, default_note_type, min_duration_minutes, is_active) VALUES
('90832', 'Psychotherapy, 30 minutes', 1, 'PROGRESS_NOTE', 16, 1),
('90834', 'Psychotherapy, 45 minutes', 1, 'PROGRESS_NOTE', 38, 1),
('90837', 'Psychotherapy, 60 minutes', 1, 'PROGRESS_NOTE', 53, 1);

-- Enforce required minimums when rows already exist.
UPDATE scheduling_service_codes
SET min_duration_minutes = 16
WHERE code = '90832'
  AND (min_duration_minutes IS NULL OR min_duration_minutes < 16);

UPDATE scheduling_service_codes
SET min_duration_minutes = 38
WHERE code = '90834'
  AND (min_duration_minutes IS NULL OR min_duration_minutes < 38);

UPDATE scheduling_service_codes
SET min_duration_minutes = 53
WHERE code = '90837'
  AND (min_duration_minutes IS NULL OR min_duration_minutes < 53);

-- Keep eligibility additive; intern_plus includes licensed-tier roles in current normalization.
INSERT IGNORE INTO credential_service_code_eligibility (credential_tier, service_code, allowed) VALUES
('intern_plus', '90832', 1),
('intern_plus', '90834', 1),
('intern_plus', '90837', 1),
('bachelors', '90832', 1),
('bachelors', '90834', 1),
('bachelors', '90837', 1);
