-- Migration 953: Ask Assistant route feedback (thumbs + corrections → learning examples)
CREATE TABLE assistant_route_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  user_id INT NOT NULL,
  prompt VARCHAR(500) NOT NULL,
  helpful TINYINT(1) NOT NULL COMMENT '1 = helpful, 0 = not helpful',
  runtime VARCHAR(64) NULL,
  routed_capability_id VARCHAR(80) NULL,
  corrected_capability_id VARCHAR(80) NULL,
  note VARCHAR(1000) NULL,
  promote_as_example TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, prompt is used as a semanticExamples boost for corrected_capability_id',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_arf_agency_created (agency_id, created_at),
  INDEX idx_arf_user_created (user_id, created_at),
  INDEX idx_arf_promote (promote_as_example, corrected_capability_id),
  CONSTRAINT fk_arf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Ask Assistant thumbs feedback and routing corrections';
