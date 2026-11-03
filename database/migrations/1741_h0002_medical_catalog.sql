-- Add the authorized screening code only where medical billing is enabled and
-- a practice already has a medical service catalog. Never overwrite an existing
-- H0002, including an inactive or customized one. Charges remain in fee schedules.
INSERT INTO agency_medical_service_codes
  (agency_id,service_code,description,unit_calc_mode,unit_minutes,min_minutes,max_minutes,
   max_units_per_session,max_units_per_day,default_place_of_service,
   allowed_credential_tiers_json,is_addon,is_active,session_mode,created_by_user_id)
SELECT a.id,'H0002','Behavioral Health Screening','SINGLE',NULL,NULL,NULL,
  1,NULL,NULL,JSON_ARRAY('intern_plus'),0,1,'individual',NULL
FROM agencies a
WHERE JSON_UNQUOTE(JSON_EXTRACT(a.feature_flags,'$.medicalBillingEnabled')) IN ('true','1','yes','on')
  AND EXISTS (SELECT 1 FROM agency_medical_service_codes m WHERE m.agency_id=a.id)
  AND NOT EXISTS (SELECT 1 FROM agency_medical_service_codes e WHERE e.agency_id=a.id AND e.service_code='H0002');
