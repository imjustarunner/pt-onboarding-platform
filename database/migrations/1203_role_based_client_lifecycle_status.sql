-- Migration 1203: Role-based client Status catalog + year dispositions + agency intake fields.
-- New school-pipeline status keys (keeps waitlist/terminated; legacy packet/pending/onboarded/current remain).

-- New-client + shared scheduling statuses
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'received', 'Received', 'Referral/packet received by the agency.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'pending_corrections', 'Pending Corrections', 'Paper packet received but missing documents/signatures/information.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'in_process', 'In Process', 'Agency intake, eligibility, or setup is actively progressing.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'ready_to_schedule', 'Ready to Schedule', 'Agency clearance complete; client may be placed on Soft Schedule.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'scheduled', 'Scheduled', 'Client has been placed on the assigned provider Soft Schedule.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'being_seen', 'Being Seen', 'Provider confirmed first day of service / services started.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

-- Continuing-client spring/fall statuses
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'spring_update_pending', 'Spring Update – Pending', 'Provider spring disposition not yet completed.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'returning', 'Returning', 'Spring forecast: expected to return next school year.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'not_returning', 'Not Returning', 'Spring forecast: not expected to return; disposition in progress.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'continuation_unknown', 'Continuation Unknown', 'Fall plan unresolved after spring update or rollover.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'confirmation_pending', 'Confirmation Pending', 'Provider must complete fall continuation confirmation.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'confirmed_returning', 'Confirmed Returning', 'Provider confirmed family will continue; agency clearance may still be pending.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'unable_to_reach', 'Unable to Reach', 'Provider could not reach family for fall confirmation.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'recommend_termination', 'Recommends Termination', 'Provider recommends termination / will not continue.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'other_transfer', 'Other / Transfer Needed', 'Nonstandard fall disposition requiring support follow-up.', TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = TRUE;

-- Agency intake workflow fields on clients
ALTER TABLE clients
  ADD COLUMN agency_intake_json JSON NULL
  COMMENT 'Agency new-client intake: packet type, corrections, EHR, clearance flags';

ALTER TABLE clients
  ADD COLUMN services_started_at DATE NULL
  COMMENT 'Provider-confirmed first service of the active school year (Being Seen)';

ALTER TABLE clients
  ADD COLUMN services_started_by_user_id INT NULL
  COMMENT 'Provider user who confirmed services started';

-- Per school-year spring/fall dispositions (current year + upcoming year)
CREATE TABLE IF NOT EXISTS client_year_dispositions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL COMMENT 'YYYY-YYYY',
  spring_outcome VARCHAR(32) NULL COMMENT 'returning | not_returning | unknown',
  summer_plan_json JSON NULL,
  fall_plan_json JSON NULL,
  spring_completed_at DATETIME NULL,
  spring_completed_by_user_id INT NULL,
  fall_outcome VARCHAR(48) NULL COMMENT 'confirmed_returning | unable_to_reach | recommend_termination | other_transfer',
  fall_comment TEXT NULL,
  fall_support_follow_up TINYINT(1) NOT NULL DEFAULT 0,
  fall_remove_from_assignment TINYINT(1) NOT NULL DEFAULT 0,
  fall_completed_at DATETIME NULL,
  fall_completed_by_user_id INT NULL,
  agency_cleared_at DATETIME NULL,
  agency_cleared_by_user_id INT NULL,
  agency_clearance_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_client_year_disposition (client_id, school_year),
  KEY idx_cyd_agency_year (agency_id, school_year),
  KEY idx_cyd_spring (spring_outcome),
  KEY idx_cyd_fall (fall_outcome),
  CONSTRAINT fk_cyd_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Map legacy packet → received for active school clients (best-effort; engine also maps)
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
INNER JOIN client_statuses cs_recv
  ON cs_recv.agency_id = c.agency_id
 AND LOWER(cs_recv.status_key) = 'received'
 AND cs_recv.is_active = TRUE
SET c.client_status_id = cs_recv.id
WHERE c.client_type = 'school'
  AND LOWER(cs.status_key) = 'packet'
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED');

-- Map legacy current → being_seen when first_service_at is set and weekday exists
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
INNER JOIN client_statuses cs_bs
  ON cs_bs.agency_id = c.agency_id
 AND LOWER(cs_bs.status_key) = 'being_seen'
 AND cs_bs.is_active = TRUE
SET c.client_status_id = cs_bs.id,
    c.services_started_at = COALESCE(c.services_started_at, DATE(c.first_service_at))
WHERE c.client_type = 'school'
  AND LOWER(cs.status_key) = 'current'
  AND c.first_service_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id
      AND cpa.is_active = TRUE
      AND cpa.service_day IS NOT NULL
      AND TRIM(cpa.service_day) <> ''
      AND LOWER(TRIM(cpa.service_day)) <> 'unknown'
  )
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED');

-- Map legacy current with weekday but no first service → scheduled
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
INNER JOIN client_statuses cs_sch
  ON cs_sch.agency_id = c.agency_id
 AND LOWER(cs_sch.status_key) = 'scheduled'
 AND cs_sch.is_active = TRUE
SET c.client_status_id = cs_sch.id
WHERE c.client_type = 'school'
  AND LOWER(cs.status_key) = 'current'
  AND c.first_service_at IS NULL
  AND EXISTS (
    SELECT 1 FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id
      AND cpa.is_active = TRUE
      AND cpa.service_day IS NOT NULL
      AND TRIM(cpa.service_day) <> ''
      AND LOWER(TRIM(cpa.service_day)) <> 'unknown'
  )
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED');

-- Map legacy onboarded / pending with provider → ready_to_schedule when no weekday
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
INNER JOIN client_statuses cs_rts
  ON cs_rts.agency_id = c.agency_id
 AND LOWER(cs_rts.status_key) = 'ready_to_schedule'
 AND cs_rts.is_active = TRUE
SET c.client_status_id = cs_rts.id
WHERE c.client_type = 'school'
  AND LOWER(cs.status_key) IN ('onboarded', 'pending')
  AND (
    c.provider_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM client_provider_assignments cpa0
      WHERE cpa0.client_id = c.id AND cpa0.is_active = TRUE
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id
      AND cpa.is_active = TRUE
      AND cpa.service_day IS NOT NULL
      AND TRIM(cpa.service_day) <> ''
      AND LOWER(TRIM(cpa.service_day)) <> 'unknown'
      AND cpa.service_day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')
  )
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED');
