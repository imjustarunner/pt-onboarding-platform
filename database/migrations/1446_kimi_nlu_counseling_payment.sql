-- Owner-directed NLU counseling acceptance and client fee for Kimi Cain only.
-- No employee pay, coaching prices, tutoring fees, or payer credentialing changed.
SET @nlu = (SELECT id FROM agencies WHERE slug='nlu');
SET @kimi = (SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
  WHERE u.id=532 AND u.first_name='Kimi' AND u.last_name='Cain' AND ua.agency_id=@nlu LIMIT 1);

INSERT INTO tenant_services (agency_id,business_type,name,description,service_code,default_duration_minutes,allows_individual,allows_group,modality,price_cents,billing_method,is_publicly_bookable,is_staff_bookable,package_eligible,program_eligible,is_active)
SELECT @nlu,'mental_health','Individual counseling — self-pay','Individual mental-health counseling through NLU. Provider-specific hourly rates; clinical intake and scheduling required.','NLU_COUNSELING_SELF_PAY',60,1,0,'EITHER',NULL,'self_pay',0,1,0,0,1
WHERE @kimi IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tenant_services WHERE agency_id=@nlu AND service_code='NLU_COUNSELING_SELF_PAY');

INSERT INTO self_pay_service_rates (agency_id,tenant_service_id,provider_user_id,rate_cents,rate_unit,updated_by_user_id)
SELECT @nlu,s.id,@kimi,10000,'hour',501 FROM tenant_services s
WHERE s.agency_id=@nlu AND s.service_code='NLU_COUNSELING_SELF_PAY' AND @kimi IS NOT NULL
ON DUPLICATE KEY UPDATE rate_cents=10000,rate_unit='hour',updated_by_user_id=501;

INSERT INTO provider_insurance_overrides (provider_user_id,insurance_type_id,is_allowed)
SELECT @kimi,i.id,1 FROM insurance_types i WHERE i.agency_id=@nlu AND i.insurance_key='medicaid' AND @kimi IS NOT NULL
ON DUPLICATE KEY UPDATE is_allowed=1;

-- Publish this specifically authorized provider's counseling listing. Existing
-- intake, actual availability, and supervision rules continue to apply.
INSERT INTO provider_public_service_enrollments (agency_id,user_id,service_type,is_active)
SELECT @nlu,@kimi,'counseling',1 WHERE @kimi IS NOT NULL
ON DUPLICATE KEY UPDATE is_active=1;

UPDATE public_marketing_pages SET branding_json=JSON_SET(branding_json,'$.kimiWebsite.counselingPayment',
'Kimi accepts Medicaid through Next Level Up. Cash/self-pay counseling is $100 per hour. NLU confirms benefits, eligibility, and appointment availability before counseling begins. Independent life coaching has separate pricing and is not billed to Medicaid.')
WHERE slug='kimi' AND @kimi IS NOT NULL;
