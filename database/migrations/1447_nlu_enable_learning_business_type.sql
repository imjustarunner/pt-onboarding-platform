-- NLU already offers tutoring and has assigned learning staff. Enable the tenant
-- category so those explicit staff grants and editable learning rates take effect.
INSERT INTO agency_business_types (agency_id,business_type,is_enabled)
SELECT id,'tutoring',1 FROM agencies WHERE slug='nlu'
ON DUPLICATE KEY UPDATE is_enabled=1;
