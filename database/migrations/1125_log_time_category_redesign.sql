-- Migration 1125: Log Time redesign — Indirect Service / Support Activity / Supervision Note
-- Extends pay_bucket, deactivates obsolete type keys, seeds new catalogs per agency.

ALTER TABLE payroll_indirect_service_types
  MODIFY COLUMN pay_bucket ENUM('indirect', 'other_1', 'support', 'supervision_note')
  NOT NULL DEFAULT 'indirect'
  COMMENT 'Log Time category group: indirect service, support activity, supervision note (other_1 legacy)';

-- Soft-deactivate legacy type keys (history preserved; no longer selectable).
UPDATE payroll_indirect_service_types
SET is_active = 0
WHERE type_key IN (
  'preparing_for_sessions',
  'supervision',
  'writing_notes',
  'non_billable_contacts',
  'prep_for_outreach',
  'travel_for_outreach',
  'virtual_outreach',
  'treatment_planning',
  'case_consultations',
  'documentation_emr',
  'client_follow_up',
  'resource_coordination',
  'other_indirect',
  'training_meetings',
  'outreach_meetings',
  'bilingual_coordination',
  'bilingual_intakes_not_billed',
  'back_to_school_events',
  'other_type_2'
);

-- Seed new Indirect Service Time types (hourly).
-- INSERT IGNORE matches migration 967; MySQL rejects INSERT SELECT ON DUPLICATE KEY UPDATE here.
INSERT IGNORE INTO payroll_indirect_service_types
  (agency_id, type_key, label, description, icon_key, pay_bucket, sort_order, is_active)
SELECT a.id, v.type_key, v.label, v.description, v.icon_key, v.pay_bucket, v.sort_order, 1
FROM agencies a
CROSS JOIN (
  SELECT 'clinical_documentation' AS type_key, 'Clinical Documentation' AS label,
         'Clinical documentation and charting' AS description, 'file-text' AS icon_key,
         'indirect' AS pay_bucket, 10 AS sort_order
  UNION ALL SELECT 'treatment_planning_svc', 'Treatment Planning',
         'Treatment planning (non-billable)', 'clipboard', 'indirect', 20
  UNION ALL SELECT 'care_coordination', 'Care Coordination',
         'Care coordination activities', 'handshake', 'indirect', 30
  UNION ALL SELECT 'client_communication', 'Client Communication',
         'Client or guardian communication', 'phone', 'indirect', 40
  UNION ALL SELECT 'client_record_review', 'Client Record Review',
         'Review client records and charts', 'book', 'indirect', 50
  UNION ALL SELECT 'scheduling_follow_up', 'Scheduling & Follow-up',
         'Scheduling and follow-up activities', 'calendar', 'indirect', 60
  UNION ALL SELECT 'billing_correction', 'Billing Correction / Claim Resolution',
         'Billing corrections and claim resolution', 'monitor', 'indirect', 70
  UNION ALL SELECT 'outreach_activities', 'Outreach Activities',
         'Approved outreach activities', 'megaphone', 'indirect', 80
) v;

UPDATE payroll_indirect_service_types pist
INNER JOIN (
  SELECT a.id AS agency_id, v.type_key, v.label, v.description, v.icon_key, v.pay_bucket, v.sort_order
  FROM agencies a
  CROSS JOIN (
    SELECT 'clinical_documentation' AS type_key, 'Clinical Documentation' AS label,
           'Clinical documentation and charting' AS description, 'file-text' AS icon_key,
           'indirect' AS pay_bucket, 10 AS sort_order
    UNION ALL SELECT 'treatment_planning_svc', 'Treatment Planning',
           'Treatment planning (non-billable)', 'clipboard', 'indirect', 20
    UNION ALL SELECT 'care_coordination', 'Care Coordination',
           'Care coordination activities', 'handshake', 'indirect', 30
    UNION ALL SELECT 'client_communication', 'Client Communication',
           'Client or guardian communication', 'phone', 'indirect', 40
    UNION ALL SELECT 'client_record_review', 'Client Record Review',
           'Review client records and charts', 'book', 'indirect', 50
    UNION ALL SELECT 'scheduling_follow_up', 'Scheduling & Follow-up',
           'Scheduling and follow-up activities', 'calendar', 'indirect', 60
    UNION ALL SELECT 'billing_correction', 'Billing Correction / Claim Resolution',
           'Billing corrections and claim resolution', 'monitor', 'indirect', 70
    UNION ALL SELECT 'outreach_activities', 'Outreach Activities',
           'Approved outreach activities', 'megaphone', 'indirect', 80
  ) v
) seed ON pist.agency_id = seed.agency_id AND pist.type_key = seed.type_key
SET pist.label = seed.label,
    pist.description = seed.description,
    pist.icon_key = seed.icon_key,
    pist.pay_bucket = seed.pay_bucket,
    pist.sort_order = seed.sort_order,
    pist.is_active = 1;

-- Seed Support Activity Time types (everyone).
INSERT IGNORE INTO payroll_indirect_service_types
  (agency_id, type_key, label, description, icon_key, pay_bucket, sort_order, is_active)
SELECT a.id, v.type_key, v.label, v.description, v.icon_key, v.pay_bucket, v.sort_order, 1
FROM agencies a
CROSS JOIN (
  SELECT 'staff_meeting' AS type_key, 'Staff Meeting' AS label,
         'Staff meeting (non-auto-logged)' AS description, 'users' AS icon_key,
         'support' AS pay_bucket, 210 AS sort_order
  UNION ALL SELECT 'required_training', 'Required Training',
         'Required training when not auto-logged', 'book', 'support', 220
  UNION ALL SELECT 'clinical_supervision_sa', 'Clinical Supervision',
         'Clinical supervision when not auto-logged', 'users', 'support', 230
  UNION ALL SELECT 'onboarding_sa', 'Onboarding',
         'Onboarding activities when not auto-logged', 'user-check', 'support', 240
  UNION ALL SELECT 'fingerprinting_credentialing', 'Fingerprinting / Credentialing',
         'Fingerprinting and credentialing activities', 'clipboard', 'support', 250
  UNION ALL SELECT 'approved_travel', 'Approved Travel',
         'Approved travel time', 'car', 'support', 260
) v;

UPDATE payroll_indirect_service_types pist
INNER JOIN (
  SELECT a.id AS agency_id, v.type_key, v.label, v.description, v.icon_key, v.pay_bucket, v.sort_order
  FROM agencies a
  CROSS JOIN (
    SELECT 'staff_meeting' AS type_key, 'Staff Meeting' AS label,
           'Staff meeting (non-auto-logged)' AS description, 'users' AS icon_key,
           'support' AS pay_bucket, 210 AS sort_order
    UNION ALL SELECT 'required_training', 'Required Training',
           'Required training when not auto-logged', 'book', 'support', 220
    UNION ALL SELECT 'clinical_supervision_sa', 'Clinical Supervision',
           'Clinical supervision when not auto-logged', 'users', 'support', 230
    UNION ALL SELECT 'onboarding_sa', 'Onboarding',
           'Onboarding activities when not auto-logged', 'user-check', 'support', 240
    UNION ALL SELECT 'fingerprinting_credentialing', 'Fingerprinting / Credentialing',
           'Fingerprinting and credentialing activities', 'clipboard', 'support', 250
    UNION ALL SELECT 'approved_travel', 'Approved Travel',
           'Approved travel time', 'car', 'support', 260
  ) v
) seed ON pist.agency_id = seed.agency_id AND pist.type_key = seed.type_key
SET pist.label = seed.label,
    pist.description = seed.description,
    pist.icon_key = seed.icon_key,
    pist.pay_bucket = seed.pay_bucket,
    pist.sort_order = seed.sort_order,
    pist.is_active = 1;

-- Seed Supervision Note Time (supervisors).
INSERT IGNORE INTO payroll_indirect_service_types
  (agency_id, type_key, label, description, icon_key, pay_bucket, sort_order, is_active)
SELECT a.id, v.type_key, v.label, v.description, v.icon_key, v.pay_bucket, v.sort_order, 1
FROM agencies a
CROSS JOIN (
  SELECT 'supervision_note_time' AS type_key, 'Supervision Note Time' AS label,
         'Write and complete supervision notes / related admin after sessions' AS description,
         'file-text' AS icon_key, 'supervision_note' AS pay_bucket, 310 AS sort_order
) v;

UPDATE payroll_indirect_service_types pist
INNER JOIN (
  SELECT a.id AS agency_id, v.type_key, v.label, v.description, v.icon_key, v.pay_bucket, v.sort_order
  FROM agencies a
  CROSS JOIN (
    SELECT 'supervision_note_time' AS type_key, 'Supervision Note Time' AS label,
           'Write and complete supervision notes / related admin after sessions' AS description,
           'file-text' AS icon_key, 'supervision_note' AS pay_bucket, 310 AS sort_order
  ) v
) seed ON pist.agency_id = seed.agency_id AND pist.type_key = seed.type_key
SET pist.label = seed.label,
    pist.description = seed.description,
    pist.icon_key = seed.icon_key,
    pist.pay_bucket = seed.pay_bucket,
    pist.sort_order = seed.sort_order,
    pist.is_active = 1;
