-- A credential classification must not give bachelor's-level staff 9-series codes.
UPDATE credential_service_code_eligibility
SET allowed = 0
WHERE credential_tier = 'bachelors' AND service_code LIKE '9%';

UPDATE billing_policy_eligibility_rules e
JOIN billing_policy_service_rules r ON r.id = e.service_rule_id
SET e.allowed = 0
WHERE e.credential_tier = 'bachelors' AND r.service_code LIKE '9%';


-- Match the corrected agency catalogs without producing an empty (unrestricted) list.
UPDATE agency_medical_service_codes
SET allowed_credential_tiers_json = JSON_REMOVE(allowed_credential_tiers_json,
  JSON_UNQUOTE(JSON_SEARCH(allowed_credential_tiers_json, 'one', 'bachelors')))
WHERE service_code LIKE '9%'
  AND JSON_TYPE(allowed_credential_tiers_json) = 'ARRAY'
  AND JSON_LENGTH(allowed_credential_tiers_json) > 1
  AND JSON_SEARCH(allowed_credential_tiers_json, 'one', 'bachelors') IS NOT NULL;
