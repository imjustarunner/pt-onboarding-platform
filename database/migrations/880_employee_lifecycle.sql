-- Migration 880: Employee Lifecycle Tab
-- Creates lifecycle_checklist_definitions, user_lifecycle_checklist_items,
-- user_separation_info, and seeds all platform checklist definitions
-- plus milestone date fields in user_info_field_definitions.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lifecycle checklist definitions (platform templates + future agency overrides)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE lifecycle_checklist_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_key VARCHAR(100) NOT NULL,
  item_label VARCHAR(255) NOT NULL,
  description TEXT NULL,
  phase ENUM('onboarding','offboarding') NOT NULL DEFAULT 'onboarding',
  category VARCHAR(64) NOT NULL COMMENT 'accounts_access | compliance_documents | background_credentialing | orientation | equipment | access_removal | property_return | final_employment',
  order_index INT NOT NULL DEFAULT 0,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  applies_to ENUM('all','provider','staff') NOT NULL DEFAULT 'all',
  label_template VARCHAR(255) NULL COMMENT 'Handlebars-style template, e.g. Met with {{supervisor_name}}',
  integration_type ENUM('manual','document_task','training_task','user_info_field','credentialing','account_setup','supervision_session','status') NOT NULL DEFAULT 'manual',
  integration_ref VARCHAR(255) NULL COMMENT 'field_key, document_template slug, module_id, etc.',
  is_platform_template TINYINT(1) NOT NULL DEFAULT 1,
  agency_id INT NULL COMMENT 'NULL = platform template; non-null = agency override/addition',
  parent_definition_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lifecycle_item_key (agency_id, item_key),
  INDEX idx_lcd_phase_cat (phase, category),
  INDEX idx_lcd_agency (agency_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-user lifecycle checklist state
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE user_lifecycle_checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  definition_id INT NOT NULL,
  is_completed TINYINT(1) NOT NULL DEFAULT 0,
  completed_at TIMESTAMP NULL,
  completed_by_user_id INT NULL,
  completion_method ENUM('manual','auto','imported') NOT NULL DEFAULT 'manual',
  manually_overridden TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'HR explicitly unchecked an auto item; auto-sync will not re-check',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_definition (user_id, definition_id),
  INDEX idx_ulci_user (user_id),
  INDEX idx_ulci_definition (definition_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Separation / offboarding metadata (one row per user when they separate)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE user_separation_info (
  user_id INT PRIMARY KEY,
  last_day_worked DATE NULL,
  separation_type ENUM('voluntary','involuntary') NULL,
  resignation_received_date DATE NULL,
  rehire_eligible TINYINT(1) NULL COMMENT 'NULL = not yet determined',
  exit_interview_completed TINYINT(1) NOT NULL DEFAULT 0,
  offboarding_notes TEXT NULL COMMENT 'Visible to HR and Admin only',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by_user_id INT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed milestone date fields into user_info_field_definitions
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'offer_accepted_date', 'Offer Accepted Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 10, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'offer_accepted_date' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'orientation_date', 'Orientation Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 20, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'orientation_date' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'therapy_notes_training_date', 'TherapyNotes Training Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 30, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'therapy_notes_training_date' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'first_payroll_submission_date', 'First Payroll Submission', 'date', NULL, FALSE, TRUE, NULL, NULL, 40, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'first_payroll_submission_date' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'probation_end_date', 'Probation End Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 50, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'probation_end_date' AND agency_id IS NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed platform checklist definitions — Onboarding
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Accounts & Access ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type, integration_ref)
VALUES
  ('company_email_created',   'Company Email Created',    'onboarding', 'accounts_access', 10, 'all',      'account_setup',   'workspace_email'),
  ('logged_into_email',       'Logged into Email',        'onboarding', 'accounts_access', 20, 'all',      'manual',          NULL),
  ('grasshopper_login',       'Grasshopper Login',        'onboarding', 'accounts_access', 30, 'all',      'manual',          NULL),
  ('therapynotes_login',      'TherapyNotes Login',       'onboarding', 'accounts_access', 40, 'provider', 'user_info_field', 'therapynotes_login'),
  ('itsco_portal_login',      'ITSCO Portal Login',       'onboarding', 'accounts_access', 50, 'all',      'manual',          NULL),
  ('google_drive_access',     'Google Drive Access',      'onboarding', 'accounts_access', 60, 'all',      'manual',          NULL),
  ('slack_teams_access',      'Slack/Teams Access',       'onboarding', 'accounts_access', 70, 'all',      'manual',          NULL),
  ('calendar_setup',          'Calendar Setup',           'onboarding', 'accounts_access', 80, 'all',      'manual',          NULL),
  ('mfa_enabled',             'MFA Enabled',              'onboarding', 'accounts_access', 90, 'all',      'manual',          NULL);

-- ── Compliance Documents ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type, integration_ref)
VALUES
  ('offer_letter_signed',         'Offer Letter Signed',              'onboarding', 'compliance_documents', 10, 'all',      'document_task', 'offer_letter'),
  ('employment_agreement_signed', 'Employment Agreement Signed',      'onboarding', 'compliance_documents', 20, 'all',      'document_task', 'employment_agreement'),
  ('w4_completed',                'W-4 Completed',                    'onboarding', 'compliance_documents', 30, 'all',      'document_task', 'w4'),
  ('i9_completed',                'I-9 Completed',                    'onboarding', 'compliance_documents', 40, 'all',      'document_task', 'i9'),
  ('direct_deposit_form',         'Direct Deposit Form',              'onboarding', 'compliance_documents', 50, 'all',      'document_task', 'direct_deposit'),
  ('confidentiality_agreement',   'Confidentiality Agreement',        'onboarding', 'compliance_documents', 60, 'all',      'document_task', 'confidentiality_agreement'),
  ('hipaa_training',              'HIPAA Training',                   'onboarding', 'compliance_documents', 70, 'all',      'training_task', 'hipaa'),
  ('handbook_acknowledged',       'Employee Handbook Acknowledgment', 'onboarding', 'compliance_documents', 80, 'all',      'document_task', 'employee_handbook'),
  ('liability_insurance_uploaded','Liability Insurance Uploaded',     'onboarding', 'compliance_documents', 90, 'provider', 'manual',          NULL),
  ('license_verification',        'License Verification',             'onboarding', 'compliance_documents',100, 'provider', 'user_info_field', 'license_type_number');

-- ── Background & Credentialing ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type, integration_ref)
VALUES
  ('background_check_ordered',   'Background Check Ordered',   'onboarding', 'background_credentialing', 10, 'all',      'user_info_field', 'provider_background_check_status'),
  ('background_check_complete',  'Background Check Complete',  'onboarding', 'background_credentialing', 20, 'all',      'user_info_field', 'provider_background_check_status'),
  ('fingerprints_complete',      'Fingerprints Complete',      'onboarding', 'background_credentialing', 30, 'provider', 'manual',          NULL),
  ('caqh_complete',              'CAQH Complete',              'onboarding', 'background_credentialing', 40, 'provider', 'user_info_field', 'caqh_provider_id'),
  ('medicaid_enrollment',        'Medicaid Enrollment',        'onboarding', 'background_credentialing', 50, 'provider', 'manual',          NULL),
  ('credentialing_submitted',    'Credentialing Submitted',    'onboarding', 'background_credentialing', 60, 'provider', 'manual',          NULL),
  ('credentialing_approved',     'Credentialing Approved',     'onboarding', 'background_credentialing', 70, 'provider', 'credentialing',   NULL);

-- ── Orientation Checklist ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, label_template, phase, category, order_index, applies_to, integration_type, integration_ref)
VALUES
  ('mileage_training',              'Mileage Training',                 NULL,                               'onboarding', 'orientation', 10, 'all',      'manual',            NULL),
  ('therapynotes_training',         'TherapyNotes Training',            NULL,                               'onboarding', 'orientation', 20, 'provider', 'training_task',     'therapynotes_training'),
  ('skill_builders_training',       'Skill Builders Training',          NULL,                               'onboarding', 'orientation', 30, 'all',      'manual',            NULL),
  ('payroll_training',              'Payroll Training',                 NULL,                               'onboarding', 'orientation', 40, 'all',      'manual',            NULL),
  ('shadowed_provider',             'Shadowed Provider',                NULL,                               'onboarding', 'orientation', 50, 'provider', 'manual',            NULL),
  ('completed_new_hire_orientation','Completed New Hire Orientation',   NULL,                               'onboarding', 'orientation', 60, 'all',      'manual',            NULL),
  ('reviewed_benefits',             'Reviewed Benefits',                NULL,                               'onboarding', 'orientation', 70, 'all',      'manual',            NULL),
  ('met_with_supervisor',           'Met with Supervisor',              'Met with {{supervisor_name}}',     'onboarding', 'orientation', 80, 'all',      'supervision_session',NULL),
  ('time_submission_training',      'Time Submission Training',         NULL,                               'onboarding', 'orientation', 90, 'all',      'manual',            NULL);

-- ── Equipment ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type)
VALUES
  ('company_card_issued',     'Company Card Issued',      'onboarding', 'equipment', 10, 'all',      'manual'),
  ('company_computer_issued', 'Company Computer Issued',  'onboarding', 'equipment', 20, 'all',      'manual'),
  ('company_phone_issued',    'Phone Extension Assigned', 'onboarding', 'equipment', 30, 'all',      'manual'),
  ('company_vehicle_assigned','Company Vehicle Assigned', 'onboarding', 'equipment', 40, 'provider', 'manual'),
  ('keys_badge_issued',       'Keys/Badge Issued',        'onboarding', 'equipment', 50, 'all',      'manual');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Seed platform checklist definitions — Offboarding
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Access Removal ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type)
VALUES
  ('offboard_email_disabled',          'Email Disabled',              'offboarding', 'access_removal', 10, 'all',      'manual'),
  ('offboard_therapynotes_removed',    'TherapyNotes Removed',        'offboarding', 'access_removal', 20, 'provider', 'manual'),
  ('offboard_grasshopper_removed',     'Grasshopper Removed',         'offboarding', 'access_removal', 30, 'all',      'manual'),
  ('offboard_itsco_portal_disabled',   'ITSCO Portal Disabled',       'offboarding', 'access_removal', 40, 'all',      'manual'),
  ('offboard_google_drive_removed',    'Google Drive Access Removed', 'offboarding', 'access_removal', 50, 'all',      'manual'),
  ('offboard_payroll_access_removed',  'Payroll Access Removed',      'offboarding', 'access_removal', 60, 'all',      'manual'),
  ('offboard_mfa_removed',             'MFA Removed',                 'offboarding', 'access_removal', 70, 'all',      'manual');

-- ── Property Return ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type)
VALUES
  ('offboard_keys_returned',         'Keys Returned',          'offboarding', 'property_return', 10, 'all',      'manual'),
  ('offboard_phone_returned',        'Phone Returned',         'offboarding', 'property_return', 20, 'all',      'manual'),
  ('offboard_computer_returned',     'Computer Returned',      'offboarding', 'property_return', 30, 'all',      'manual'),
  ('offboard_company_card_returned', 'Company Card Returned',  'offboarding', 'property_return', 40, 'all',      'manual'),
  ('offboard_vehicle_returned',      'Vehicle Returned',       'offboarding', 'property_return', 50, 'provider', 'manual');

-- ── Final Employment Items ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type)
VALUES
  ('offboard_final_payroll_submitted',       'Final Payroll Submitted',        'offboarding', 'final_employment', 10, 'all', 'manual'),
  ('offboard_pto_paid_out',                  'PTO Paid Out',                   'offboarding', 'final_employment', 20, 'all', 'manual'),
  ('offboard_mileage_reimbursement',         'Mileage Reimbursement Completed','offboarding', 'final_employment', 30, 'all', 'manual'),
  ('offboard_benefits_terminated',           'Benefits Terminated',            'offboarding', 'final_employment', 40, 'all', 'manual'),
  ('offboard_cobra_sent',                    'COBRA Information Sent',         'offboarding', 'final_employment', 50, 'all', 'manual'),
  ('offboard_licenses_transferred',          'Licenses Transferred',           'offboarding', 'final_employment', 60, 'provider', 'manual'),
  ('offboard_documentation_archived',        'Documentation Archived',         'offboarding', 'final_employment', 70, 'all', 'manual');
