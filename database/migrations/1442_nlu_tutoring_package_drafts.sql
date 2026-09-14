-- Editable defaults: no employee assignment, public booking, purchase, or payment.
INSERT INTO tenant_services (agency_id,business_type,name,description,service_code,default_duration_minutes,allows_individual,allows_group,modality,price_cents,billing_method,is_publicly_bookable,is_staff_bookable,package_eligible,program_eligible,is_active)
SELECT a.id,'tutoring',d.name,'Hourly learning support; fee comes from the assigned provider or learning tier.',d.code,60,1,0,d.modality,NULL,'self_pay',0,1,1,1,1
FROM agencies a CROSS JOIN (
 SELECT 'Individual tutoring — virtual' name,'TUTORING VIRTUAL' code,'TELEHEALTH' modality
 UNION ALL SELECT 'Individual tutoring — in person','TUTORING IN PERSON','IN_PERSON'
) d WHERE a.slug='nlu' AND NOT EXISTS(SELECT 1 FROM tenant_services s WHERE s.agency_id=a.id AND s.service_code=d.code);
INSERT INTO booking_packages (agency_id,business_type,name,description,package_type,session_count,price_cents,billing_options_json,policies_json,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
SELECT a.id,'tutoring',CONCAT('Six tutoring sessions — ',IF(s.modality='TELEHEALTH','virtual','in person'),' — 10% off'),
'Editable draft. Review session count, discount, cancellation terms and assigned staff before activating.','prepaid_bundle',6,0,
JSON_OBJECT('modes',JSON_ARRAY('pay_in_full')),JSON_OBJECT('cancellationNoticeHours',24,'lateCancelPolicy','forfeit','noShowPolicy','forfeit','freeMisses',0,'bonusSessions',0,'expirationDays',NULL),
JSON_OBJECT('sessionMinutes',60,'deliveryMode','1:1','autoEnrollSubject',false,'pricing',JSON_OBJECT('mode','provider-discount','discountPercent',10,'minutes',60,'format',IF(s.modality='TELEHEALTH','virtual','in-person'))),JSON_ARRAY(s.id),'reserve',0,0
FROM agencies a JOIN tenant_services s ON s.agency_id=a.id WHERE a.slug='nlu' AND s.service_code IN ('TUTORING VIRTUAL','TUTORING IN PERSON') AND NOT EXISTS (SELECT 1 FROM booking_packages p WHERE p.agency_id=a.id AND p.name=CONCAT('Six tutoring sessions — ',IF(s.modality='TELEHEALTH','virtual','in person'),' — 10% off'));
