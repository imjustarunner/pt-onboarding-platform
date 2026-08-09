-- Migration 1000: Track sub-page tab switches and inline actions for deeper usage analytics
CREATE TABLE user_tab_events (
  id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED   NULL,
  agency_id  INT UNSIGNED   NULL,
  action_type VARCHAR(50)   NOT NULL DEFAULT 'admin_tab_view'
             COMMENT 'admin_tab_view or admin_action',
  page       VARCHAR(255)   NULL
             COMMENT 'Normalized page key, e.g. caseload-hub-schools-staff',
  tab        VARCHAR(255)   NULL
             COMMENT 'Tab or action id, e.g. events, coverage-needs',
  extra      JSON           NULL
             COMMENT 'Optional extra context (filters, ids, etc.)',
  created_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ute_user    (user_id),
  INDEX idx_ute_agency  (agency_id),
  INDEX idx_ute_page    (page),
  INDEX idx_ute_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
