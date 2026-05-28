-- Migration 822: Link kiosk punch pairs to direct + indirect payroll time claims
-- payroll_time_claim_id remains the direct claim; indirect claim stored separately.

ALTER TABLE skill_builders_event_kiosk_punches
  ADD COLUMN payroll_indirect_claim_id INT NULL DEFAULT NULL
    COMMENT 'payroll_time_claims.id for indirect bucket (payroll_time_claim_id = direct claim)'
    AFTER payroll_time_claim_id,
  ADD INDEX idx_sb_kiosk_punches_indirect_claim (payroll_indirect_claim_id),
  ADD CONSTRAINT fk_sb_kiosk_punches_indirect_claim
    FOREIGN KEY (payroll_indirect_claim_id) REFERENCES payroll_time_claims(id) ON DELETE SET NULL;
