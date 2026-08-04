-- Migration 1133: per-user Log Time duty assignments with optional rate overrides
CREATE TABLE payroll_user_indirect_service_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  service_type_id INT NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  rate_override DECIMAL(10,2) NULL DEFAULT NULL
    COMMENT 'Optional $/hr override; null uses default bucket rate',
  sort_order INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_indirect_service (agency_id, user_id, service_type_id),
  INDEX idx_user_indirect_agency_user (agency_id, user_id),
  CONSTRAINT fk_puisa_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_puisa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_puisa_type FOREIGN KEY (service_type_id) REFERENCES payroll_indirect_service_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
