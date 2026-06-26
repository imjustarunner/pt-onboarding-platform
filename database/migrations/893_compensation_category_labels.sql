-- Migration 893: Custom names for each compensation category per agency
CREATE TABLE payroll_compensation_category_labels (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  agency_id  INT          NOT NULL,
  category   TINYINT      NOT NULL COMMENT '1-3',
  name       VARCHAR(120) NOT NULL DEFAULT '',
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_cat (agency_id, category)
);
