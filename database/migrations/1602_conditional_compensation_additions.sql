-- Dated handbook additions: preserve earned compensation when an addition changes.
CREATE TABLE IF NOT EXISTS payroll_conditional_addition_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  category TINYINT NOT NULL,
  level TINYINT NOT NULL,
  effective_on DATE NOT NULL,
  clinical_addition DECIMAL(10,2) NOT NULL DEFAULT 0,
  hcode_addition DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_conditional_addition_date (agency_id,category,level,effective_on,id)
);
