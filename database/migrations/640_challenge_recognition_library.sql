-- Challenge Recognition Library
-- Stores reusable award templates and eligibility group templates per club.
-- When configuring a season, managers pick from these; a snapshot is copied into
-- recognition_categories_json so each season remains independently editable.

-- ── Eligibility Groups ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_eligibility_groups (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  agency_id  INT NOT NULL COMMENT 'Club this group belongs to',
  label      VARCHAR(128) NOT NULL COMMENT 'Display name, e.g. Juniors',
  criteria   JSON NULL COMMENT '[{field, operator, value}]',
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ceg_agency (agency_id),
  CONSTRAINT fk_ceg_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

-- ── Recognition Awards ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_recognition_awards (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL COMMENT 'Club this award belongs to',
  label            VARCHAR(128) NOT NULL COMMENT 'Award title, e.g. Sasquatch',
  icon             VARCHAR(16) NULL COMMENT 'Emoji or icon identifier',
  period           ENUM('weekly','monthly','season') NOT NULL DEFAULT 'weekly',
  activity_type    VARCHAR(64) NULL COMMENT 'Filter: empty = any, e.g. trail_run',
  metric           ENUM('points','distance_miles','duration_minutes','activities_count') NOT NULL DEFAULT 'points',
  aggregation      ENUM('most','average') NOT NULL DEFAULT 'most',
  group_filter     VARCHAR(128) NULL COMMENT 'masters | heavyweight_male | heavyweight_female | group_{id} | empty',
  gender_variants  JSON NULL COMMENT '["Male","Female"] or []',
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_cra_agency (agency_id),
  CONSTRAINT fk_cra_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
