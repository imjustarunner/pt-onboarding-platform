-- Store Med Cancel payroll settings per agency (rates + pay service code)
ALTER TABLE agencies
  ADD COLUMN medcancel_policy_json JSON NULL;

