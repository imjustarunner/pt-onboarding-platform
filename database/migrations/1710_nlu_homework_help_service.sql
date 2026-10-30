-- Separate internal academic-service classification. No public booking, client
-- price, employee rate activation, signed-agreement change or insurance code.
INSERT INTO tenant_services
 (agency_id,business_type,name,description,service_code,default_duration_minutes,allows_individual,allows_group,modality,price_cents,billing_method,is_publicly_bookable,is_staff_bookable,package_eligible,program_eligible,is_active)
SELECT a.id,'tutoring','Homework Help','Academic homework support. Use the separately approved Homework Help compensation schedule; establish the client fee before collecting payment.',
 'HOMEWORK HELP',60,1,0,'IN_PERSON',NULL,'self_pay',0,1,0,0,1
FROM agencies a WHERE a.slug='nlu'
 AND NOT EXISTS(SELECT 1 FROM tenant_services s WHERE s.agency_id=a.id AND s.service_code='HOMEWORK HELP');

INSERT IGNORE INTO payroll_service_code_rules
 (agency_id,service_code,category,other_slot,unit_to_hour_multiplier,duration_minutes,counts_for_tier,tier_credit_multiplier,pay_divisor,pay_rate_unit,credit_value,show_in_rate_sheet,pay_method)
SELECT a.id,c.code,'direct',1,c.hours,c.minutes,0,0,c.divisor,c.rate_unit,c.hours,1,'fixed_rate'
FROM agencies a CROSS JOIN (
 SELECT 'HOMEWORK HELP' AS code,1 AS hours,60 AS minutes,1 AS divisor,'per_hour' AS rate_unit
 UNION ALL SELECT 'HOMEWORK HELP 15 MIN',0.25,15,4,'per_unit'
) c WHERE a.slug IN ('nlu','tisi');
