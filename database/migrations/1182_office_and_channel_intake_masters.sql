-- Migration 1182: Master Office digital/paper forms + framed tutoring/consulting/coaching masters

CREATE TABLE IF NOT EXISTS agency_office_intake_masters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  language_code VARCHAR(8) NOT NULL DEFAULT 'en',
  title VARCHAR(255) NULL,
  intake_steps JSON NULL,
  intake_fields JSON NULL,
  version INT NOT NULL DEFAULT 1,
  editor_intake_link_id INT NULL COMMENT 'Shadow intake_links row for Master Office Digital editor',
  published_intake_link_id INT NULL COMMENT 'Active agency-scoped shell used by Join In-Depth pathway',
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_office_intake_master_lang (agency_id, language_code),
  KEY idx_agency_office_intake_masters_editor (editor_intake_link_id),
  KEY idx_agency_office_intake_masters_published (published_intake_link_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS office_packet_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  locale VARCHAR(8) NOT NULL DEFAULT 'en',
  version INT NOT NULL DEFAULT 1,
  html_content LONGTEXT NOT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_office_packet_template_agency_locale (agency_id, locale),
  KEY idx_office_packet_templates_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS office_packet_template_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  locale VARCHAR(8) NOT NULL DEFAULT 'en',
  version INT NOT NULL,
  html_content LONGTEXT NOT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_office_packet_ver (agency_id, locale, version),
  KEY idx_office_packet_ver_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Framed masters for future verticals (tutoring / consulting / coaching)
CREATE TABLE IF NOT EXISTS agency_channel_intake_masters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  channel VARCHAR(32) NOT NULL COMMENT 'tutoring | consulting | coaching',
  language_code VARCHAR(8) NOT NULL DEFAULT 'en',
  title VARCHAR(255) NULL,
  intake_steps JSON NULL,
  intake_fields JSON NULL,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'framed' COMMENT 'framed | active',
  editor_intake_link_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_channel_intake_master (agency_id, channel, language_code),
  KEY idx_agency_channel_intake_masters_editor (editor_intake_link_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE intake_links
  ADD COLUMN inherits_office_master TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, public intake resolves steps/fields from agency_office_intake_masters'
    AFTER is_school_master;

ALTER TABLE intake_links
  ADD COLUMN is_office_master TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, this row is the editable shadow for an agency office digital form master'
    AFTER inherits_office_master;

ALTER TABLE intake_links
  ADD COLUMN master_channel VARCHAR(32) NULL
    COMMENT 'Optional channel key for framed vertical masters (tutoring/consulting/coaching)'
    AFTER is_office_master;
