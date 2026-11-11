-- Narrow projection of deployed column types for disposable MySQL validation. No production data.

CREATE TABLE `agencies` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `name` varchar(255) NOT NULL,
 `official_name` varchar(255) NULL,
 `slug` varchar(100) NOT NULL,
 `portal_url` varchar(255) NULL,
 `organization_type` enum('agency','school','program','learning','clinical','affiliation','ClubWebApp','life_coach','consultant') NOT NULL DEFAULT 'agency',
 `is_active` tinyint(1) NULL DEFAULT '1',
 `is_archived` tinyint(1) NULL DEFAULT '0',
 `logo_url` varchar(500) NULL,
 `color_palette` json NULL,
 `feature_flags` json NULL,
 `theme_settings` json NULL,
 `public_availability_enabled` tinyint(1) NOT NULL DEFAULT '0',
 `timezone` varchar(64) NULL,
 `website_url` varchar(512) NULL,
 `careers_page_json` json NULL,
 `account_owner_user_id` int NULL,
 `phone_number` varchar(20) NULL
) ENGINE=InnoDB;

CREATE TABLE `users` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `email` varchar(255) NULL,
 `username` varchar(255) NULL,
 `work_email` varchar(255) NULL,
 `personal_email` varchar(255) NULL,
 `first_name` varchar(100) NULL,
 `last_name` varchar(100) NULL,
 `role` enum('admin','assistant_admin','supervisor','facilitator','intern','super_admin','support','staff','provider','school_staff','client_guardian','clinical_practice_assistant','provider_plus','kiosk','club_manager','athlete','assistant') NULL DEFAULT 'provider',
 `status` enum('PROSPECTIVE','PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING','ACTIVE_EMPLOYEE','TERMINATED_PENDING','INACTIVE_EMPLOYEE','ARCHIVED','EHR_ONLY') NOT NULL DEFAULT 'PENDING_SETUP',
 `is_demo` tinyint(1) NOT NULL DEFAULT '0',
 `is_active` tinyint(1) NOT NULL DEFAULT '1',
 `is_archived` tinyint(1) NULL DEFAULT '0',
 `password_hash` varchar(255) NULL,
 `credential` varchar(255) NULL,
 `title` varchar(120) NULL,
 `service_focus` text NULL,
 `provider_school_info_blurb` text NULL,
 `work_location` varchar(255) NULL,
 `timezone` varchar(64) NULL,
 `sees_clients` tinyint(1) NOT NULL DEFAULT '1',
 `has_provider_access` tinyint(1) NULL DEFAULT '0',
 `provider_accepting_new_clients` tinyint(1) NOT NULL DEFAULT '1',
 `in_office_available` tinyint(1) NOT NULL DEFAULT '0',
 `identity_product` varchar(32) NOT NULL DEFAULT 'full_suite',
 `sso_password_override` tinyint(1) NOT NULL DEFAULT '0',
 `login_is_group_email` tinyint(1) NOT NULL DEFAULT '0',
 `passwordless_token` varchar(255) NULL,
 `passwordless_token_expires_at` timestamp NULL,
 `passwordless_token_purpose` enum('setup','reset','prehire_portal') NULL DEFAULT 'setup',
 `invitation_token` varchar(255) NULL,
 `invitation_token_expires_at` timestamp NULL,
 `temporary_password_hash` varchar(255) NULL,
 `temporary_password_expires_at` timestamp NULL,
 `email_verified_at` timestamp NULL,
 `email_verification_token` varchar(255) NULL,
 `email_verification_token_expires_at` timestamp NULL,
 UNIQUE KEY uq_test_user_email(email)
) ENGINE=InnoDB;

CREATE TABLE `user_agencies` (
 `user_id` int NOT NULL,
 `agency_id` int NOT NULL,
 `is_active` tinyint(1) NOT NULL DEFAULT '1',
 `is_default` tinyint(1) NOT NULL DEFAULT '0',
 `agency_role` varchar(64) NULL,
 PRIMARY KEY(user_id,agency_id)
) ENGINE=InnoDB;

CREATE TABLE `user_preferences` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `user_id` int NOT NULL,
 `timezone` varchar(64) NULL,
 `sms_enabled` tinyint(1) NULL DEFAULT '0',
 `sms_forwarding_enabled` tinyint(1) NULL DEFAULT '1',
 `sms_support_mirror_enabled` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB;

CREATE TABLE `office_locations` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `agency_id` int NOT NULL,
 `name` varchar(255) NOT NULL,
 `street_address` varchar(255) NULL,
 `city` varchar(128) NULL,
 `state` varchar(64) NULL,
 `postal_code` varchar(32) NULL,
 `timezone` varchar(64) NULL DEFAULT 'America/New_York',
 `access_key` varchar(64) NOT NULL,
 `is_active` tinyint(1) NULL DEFAULT '1'
) ENGINE=InnoDB;

CREATE TABLE `office_location_agencies` (
 `office_location_id` int NOT NULL,
 `agency_id` int NOT NULL
) ENGINE=InnoDB;

CREATE TABLE `user_office_locations` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `user_id` int NOT NULL,
 `office_location_id` int NOT NULL
) ENGINE=InnoDB;

CREATE TABLE `provider_public_profiles` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `user_id` int NOT NULL,
 `public_blurb` text NULL,
 `self_pay_rate_cents` int NULL,
 `self_pay_rate_note` varchar(255) NULL,
 `public_details_json` json NULL
) ENGINE=InnoDB;

CREATE TABLE `provider_public_service_enrollments` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `agency_id` int NOT NULL,
 `user_id` int NOT NULL,
 `service_type` varchar(32) NOT NULL,
 `is_active` tinyint NOT NULL DEFAULT '1'
) ENGINE=InnoDB;

CREATE TABLE `provider_virtual_working_hours` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `agency_id` int NOT NULL,
 `provider_id` int NOT NULL,
 `day_of_week` varchar(16) NOT NULL,
 `start_time` time NOT NULL,
 `end_time` time NOT NULL,
 `session_type` varchar(16) NOT NULL DEFAULT 'REGULAR',
 `frequency` varchar(16) NOT NULL DEFAULT 'WEEKLY',
 `purpose` varchar(16) NOT NULL DEFAULT 'ONGOING',
 `available_for_intake` tinyint(1) NOT NULL DEFAULT '0',
 `available_for_session` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB;

CREATE TABLE `agency_public_service_types` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `agency_id` int NOT NULL,
 `service_type` varchar(32) NOT NULL,
 `display_name` varchar(128) NOT NULL DEFAULT '',
 `intro_blurb` text NULL,
 `is_enabled` tinyint NOT NULL DEFAULT '1'
) ENGINE=InnoDB;

CREATE TABLE `agency_billing_accounts` (
 `agency_id` int NOT NULL,
 `autopay_enabled` tinyint(1) NOT NULL DEFAULT '0',
 `feature_entitlements_json` json NULL,
 PRIMARY KEY(agency_id)
) ENGINE=InnoDB;

CREATE TABLE `clients` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `agency_id` int NOT NULL,
 `organization_id` int NOT NULL,
 `provider_id` int NULL,
 `full_name` varchar(255) NULL,
 `initials` varchar(32) NOT NULL,
 `date_of_birth` date NULL,
 `grade` varchar(32) NULL,
 `preferred_language` varchar(100) NULL,
 `identifier_code` varchar(32) NULL,
 `status` enum('PENDING_REVIEW','ACTIVE','ON_HOLD','DECLINED','ARCHIVED','PACKET','SCREENER','RETURNING') NOT NULL DEFAULT 'PENDING_REVIEW',
 `submission_date` date NOT NULL,
 `client_type` enum('basic_nonclinical','school','learning','clinical') NOT NULL DEFAULT 'basic_nonclinical',
 `source` enum('BULK_IMPORT','SCHOOL_UPLOAD','SCHOOL_UPLOAD_INTERNAL','PUBLIC_INTAKE_LINK','PUBLIC_BOOKING_INQUIRY','DIGITAL_FORM','ADMIN_CREATED','PUBLIC_OFFICE_INTAKE','BILLING_IMPORT','ADAPTIVE_QUICK_PROSPECTIVE','SESSION_RECORDING','NOTE_AID_MINIMAL') NOT NULL,
 `is_demo` tinyint(1) NOT NULL DEFAULT '0',
 `guardian_portal_enabled` tinyint(1) NOT NULL DEFAULT '0',
 `session_email_opt_in` tinyint(1) NULL,
 `session_sms_opt_in` tinyint(1) NULL,
 `session_phone_opt_in` tinyint(1) NULL,
 `created_by_user_id` int NULL,
 `internal_notes` text NULL,
 FOREIGN KEY (agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB;

CREATE TABLE `client_agency_assignments` (
 `client_id` int NOT NULL,
 `agency_id` int NOT NULL,
 `is_primary` tinyint(1) NOT NULL DEFAULT '0',
 `is_active` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB;

CREATE TABLE `client_provider_assignments` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `client_id` int NOT NULL,
 `organization_id` int NOT NULL,
 `provider_user_id` int NOT NULL,
 `is_primary` tinyint(1) NOT NULL DEFAULT '0',
 `is_active` tinyint(1) NOT NULL DEFAULT '1',
 `created_by_user_id` int NULL
) ENGINE=InnoDB;

CREATE TABLE `appointments` (
 `id` int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `agency_id` int NOT NULL,
 `provider_user_id` int NULL,
 `start_at` datetime NOT NULL,
 `end_at` datetime NOT NULL,
 `status` varchar(64) NOT NULL DEFAULT 'confirmed',
 `modality` varchar(32) NULL,
 `source` varchar(64) NOT NULL DEFAULT 'staff_grid',
 `title` varchar(255) NULL,
 `service_code` varchar(32) NULL,
 `created_by_user_id` int NULL,
 `notification_mode` varchar(32) NULL DEFAULT 'default',
 `source_timezone` varchar(64) NULL
) ENGINE=InnoDB;

CREATE TABLE `appointment_participants` (
 `id` int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `appointment_id` int unsigned NOT NULL,
 `role` varchar(32) NOT NULL DEFAULT 'client',
 `client_id` int NULL,
 `receives_reminders` tinyint(1) NOT NULL DEFAULT '1',
 `display_name` varchar(255) NULL,
 FOREIGN KEY (appointment_id) REFERENCES appointments(id)
) ENGINE=InnoDB;

CREATE TABLE `hiring_job_descriptions` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `agency_id` int NOT NULL,
 `title` varchar(255) NOT NULL,
 `description_text` longtext NULL,
 `city` varchar(120) NULL,
 `state` varchar(120) NULL,
 `schedule_text` varchar(500) NULL,
 `is_active` tinyint(1) NOT NULL DEFAULT '1',
 `created_by_user_id` int NOT NULL,
 `posted_date` date NULL,
 `tags_json` json NULL,
 `role_type` varchar(80) NULL,
 `publish_at` datetime NULL,
 `unpublish_at` datetime NULL
) ENGINE=InnoDB;

CREATE TABLE `intake_links` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `public_key` varchar(64) NOT NULL,
 `job_description_id` int NULL,
 `form_type` enum('intake','public_form','job_application','medical_records_request','smart_school_roi','smart_registration','internal_preferences','life_balance_wheel','assessment','evaluation','smart_disclosure') NOT NULL DEFAULT 'intake',
 `is_active` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB;

CREATE TABLE `user_login_emails` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `user_id` int NOT NULL,
 `agency_id` int NULL,
 `email` varchar(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE `auth_session_security` (
 `session_key` char(64) NOT NULL,
 `user_id` int NULL,
 `last_activity_at` datetime(3) NOT NULL,
 `absolute_expires_at` bigint NOT NULL,
 `revoked_at` datetime(3) NULL
) ENGINE=InnoDB;

CREATE TABLE `user_activity_log` (
 `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `action_type` varchar(100) NOT NULL,
 `user_id` int NULL,
 `agency_id` int NULL,
 `metadata` json NULL
) ENGINE=InnoDB;

CREATE TABLE user_auth_revocations (user_id INT PRIMARY KEY,reject_issued_before BIGINT NOT NULL,revoked_at DATETIME(3),revoked_by_user_id INT);
CREATE TABLE quick_view_sessions (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,revoked_at DATETIME(3));
CREATE TABLE account_mfa_devices (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,revoked_at DATETIME(3));
CREATE TABLE account_mfa_sessions (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT);
CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active TINYINT DEFAULT 1);
CREATE TABLE client_service_enrollments(id BIGINT AUTO_INCREMENT PRIMARY KEY,client_id INT,agency_id INT,organization_id INT,is_active TINYINT DEFAULT 1);

CREATE TABLE clinical_note_drafts(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,client_id INT,input_text TEXT);

CREATE TABLE agency_business_types(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,business_type VARCHAR(64),is_enabled TINYINT,sort_order INT);
