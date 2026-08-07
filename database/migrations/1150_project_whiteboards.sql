-- Migration 1150: per-project whiteboards table
-- Each project can have multiple named whiteboards saved independently.

CREATE TABLE IF NOT EXISTS project_whiteboards (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id    INT UNSIGNED NOT NULL,
  name          VARCHAR(160) NOT NULL DEFAULT 'Whiteboard',
  data          LONGTEXT     NULL     DEFAULT NULL COMMENT 'JSON canvas state',
  created_by    INT UNSIGNED NULL     DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pw_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
