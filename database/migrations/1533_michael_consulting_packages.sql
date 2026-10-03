-- Migration 1533: publish Michael's consulting offers in the unified booking catalog.
SET @michael_agency_id := (SELECT id FROM agencies WHERE slug = 'michael' LIMIT 1);

INSERT INTO tenant_services
  (agency_id,business_type,name,description,service_code,default_duration_minutes,allows_individual,allows_group,modality,price_cents,billing_method,is_publicly_bookable,is_staff_bookable,package_eligible,program_eligible,is_active)
SELECT @michael_agency_id,'consulting','Clarity Session','A focused 60-minute session to identify the real problem and the next practical move.','MICHAEL_CLARITY',60,1,0,'VIRTUAL',25000,'self_pay',1,1,1,0,1
WHERE @michael_agency_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenant_services WHERE agency_id=@michael_agency_id AND service_code='MICHAEL_CLARITY');

INSERT INTO booking_packages
  (agency_id,business_type,name,description,package_type,session_count,price_cents,billing_options_json,policies_json,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
SELECT @michael_agency_id,'consulting','Clarity Session','A focused 60-minute session to identify the real problem and the next practical move.','prepaid_bundle',1,25000,NULL,NULL,NULL,NULL,'complete',1,1
WHERE @michael_agency_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='Clarity Session');

INSERT INTO booking_packages
  (agency_id,business_type,name,description,package_type,session_count,price_cents,billing_options_json,policies_json,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
SELECT @michael_agency_id,'consulting','Practice Launch Sprint','Four weeks of guided private-practice launch strategy, service design, pricing, and operational planning.','consulting_project',4,250000,NULL,NULL,NULL,'[]','complete',1,1
WHERE @michael_agency_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='Practice Launch Sprint');

INSERT INTO booking_packages
  (agency_id,business_type,name,description,package_type,session_count,price_cents,billing_options_json,policies_json,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
SELECT @michael_agency_id,'consulting','AI Product Blueprint','A six-week product and AI strategy engagement that turns an idea into a responsible, buildable roadmap.','consulting_project',6,500000,NULL,NULL,NULL,'[]','complete',1,1
WHERE @michael_agency_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='AI Product Blueprint');

INSERT INTO booking_packages
  (agency_id,business_type,name,description,package_type,session_count,price_cents,billing_options_json,policies_json,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
SELECT @michael_agency_id,'consulting','Impact Expansion Lab','A 90-day nonprofit growth engagement focused on capacity, partnerships, program packaging, and responsible expansion.','consulting_project',6,750000,NULL,NULL,NULL,'[]','complete',1,1)
WHERE @michael_agency_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='Impact Expansion Lab');
