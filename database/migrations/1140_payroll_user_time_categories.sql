-- Migration 1140: per-user time submission categories
-- Allows admins / payroll staff to configure which time-submission categories
-- appear on a provider's dashboard (Indirect, Support Activity, Supervisor,
-- Indirect Plus). Indirect Plus maps to the provider's other_rate_1 slot.

CREATE TABLE payroll_user_time_categories (
  id            INT            NOT NULL AUTO_INCREMENT,
  agency_id     INT            NOT NULL,
  user_id       INT            NOT NULL,

  -- 'indirect' | 'support_activity' | 'supervisor' | 'indirect_plus'
  category_type VARCHAR(50)    NOT NULL
    COMMENT 'indirect=indirect_rate, support_activity=MEETING rate, supervisor=supervisor pay, indirect_plus=other_rate_1',

  -- Optional display-label override shown on the provider dashboard card
  label         VARCHAR(100)   NULL DEFAULT NULL
    COMMENT 'Override display label, e.g. ''Translation Services''',

  enabled       TINYINT(1)     NOT NULL DEFAULT 1,
  sort_order    INT            NOT NULL DEFAULT 0,

  created_by_user_id INT NULL,
  created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_user_cat   (agency_id, user_id, category_type),
  INDEX        idx_agency_user (agency_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Per-user additional time submission category configuration';
