-- Pro Bono never earns service pay, automatic allowance, or payroll tier credits.
-- Historical posted summaries and signed agreement snapshots remain unchanged.
UPDATE payroll_rates SET rate_amount=0, pay_percent=NULL, pay_method='fixed_rate'
WHERE UPPER(REPLACE(REPLACE(REPLACE(TRIM(service_code),' ',''),'-',''),'_','')) IN ('PROBONO','PROBONOSERVICE');
UPDATE payroll_rate_template_rates SET rate_amount=0
WHERE UPPER(REPLACE(REPLACE(REPLACE(TRIM(service_code),' ',''),'-',''),'_','')) IN ('PROBONO','PROBONOSERVICE');
UPDATE payroll_compensation_level_rates SET rate_amount=0
WHERE UPPER(REPLACE(REPLACE(REPLACE(TRIM(service_code),' ',''),'-',''),'_','')) IN ('PROBONO','PROBONOSERVICE');
UPDATE payroll_service_code_rules SET pay_system_bucket='skip', flat_rate_amount=0,
  pay_method='fixed_rate', pay_percent=NULL, counts_for_tier=0, tier_credit_multiplier=0, credit_value=0
WHERE UPPER(REPLACE(REPLACE(REPLACE(TRIM(service_code),' ',''),'-',''),'_','')) IN ('PROBONO','PROBONOSERVICE');

CREATE TABLE payroll_correction_resolutions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  user_id INT NOT NULL,
  correction_key CHAR(64) NOT NULL,
  source_payroll_period_id INT NOT NULL,
  baseline_row_id BIGINT NOT NULL,
  compare_row_id BIGINT NULL,
  resolution VARCHAR(24) NOT NULL,
  reason TEXT NOT NULL,
  review_json JSON NOT NULL,
  reviewed_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_correction_resolution (agency_id, correction_key),
  KEY idx_payroll_correction_resolution_period (agency_id, payroll_period_id)
);
