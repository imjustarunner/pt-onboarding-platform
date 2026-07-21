-- Migration 1025: school event marketing photos + marketing contact flag
-- School events are always indirect payroll; kiosk staff photos notify Marketing contacts.

ALTER TABLE user_agencies
  ADD COLUMN is_marketing_contact TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, user receives Marketing category notifications (e.g. school event photos)';

CREATE TABLE school_event_staff_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  company_event_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  photo_path VARCHAR(1000) NULL COMMENT 'GCS/storage key under uploads/',
  photo_url VARCHAR(1000) NULL COMMENT 'Public URL for marketing preview',
  uploaded_via VARCHAR(32) NOT NULL DEFAULT 'mid_shift'
    COMMENT 'mid_shift | checkout | bypass_ack',
  bypassed TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 when staff could not provide a photo and acknowledged marketing will be notified',
  bypass_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_se_staff_photo_event_user (company_event_id, provider_user_id),
  INDEX idx_se_staff_photo_agency (agency_id),
  INDEX idx_se_staff_photo_user (provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- School portal events never use direct hours; force existing rows to indirect-only.
UPDATE company_events
SET skill_builder_direct_hours = 0
WHERE event_type IN (
  'school_back_to_school',
  'school_fall_check_in',
  'school_spring_event',
  'school_first_day',
  'school_open_house',
  'school_resource_fair',
  'school_family_night',
  'school_orientation',
  'school_holiday',
  'school_day_off',
  'school_other'
);
