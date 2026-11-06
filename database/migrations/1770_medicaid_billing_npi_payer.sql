-- Migration 1770: seeded Medicaid NPI rules match the Colorado Medicaid payer id.
-- A blank plan type means every plan under that payer.
UPDATE billing_claim_overrides
SET payer_id = 'COCHA',
    policy_reference = COALESCE(NULLIF(policy_reference, ''), 'Colorado Medicaid billing NPI 1215615711'),
    effective_from = COALESCE(effective_from, '2020-01-01'),
    effective_through = COALESCE(effective_through, '2099-12-31'),
    notes = CASE
      WHEN CHAR_LENGTH(COALESCE(notes, '')) < 10 THEN 'Medicaid claims bill under group NPI 1215615711'
      ELSE notes
    END
WHERE scope = 'payer'
  AND field_key = 'billing_npi'
  AND to_value = '1215615711'
  AND payer_id IS NULL
  AND payer_name IN ('Medicaid', 'Colorado Medicaid');
