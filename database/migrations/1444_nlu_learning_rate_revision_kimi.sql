-- NLU learning standards revised September 14, 2026. Dollar amounts are cents.

SET @nlu = (SELECT id FROM agencies WHERE slug='nlu');

SET @tier_index = JSON_UNQUOTE(JSON_SEARCH((SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=@nlu),'one','L1',NULL,'$.tiers[*].id'));
 UPDATE agency_learning_catalogs SET catalog_json=JSON_SET(catalog_json,REPLACE(@tier_index,'.id','.pay.virtual'),1800,REPLACE(@tier_index,'.id','.pay."in-person"'),1900,REPLACE(@tier_index,'.id','.fees.virtual'),3200,REPLACE(@tier_index,'.id','.fees."in-person"'),3700) WHERE agency_id=@nlu AND @tier_index IS NOT NULL;

SET @tier_index = JSON_UNQUOTE(JSON_SEARCH((SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=@nlu),'one','L2',NULL,'$.tiers[*].id'));
 UPDATE agency_learning_catalogs SET catalog_json=JSON_SET(catalog_json,REPLACE(@tier_index,'.id','.pay.virtual'),2000,REPLACE(@tier_index,'.id','.pay."in-person"'),2100,REPLACE(@tier_index,'.id','.fees.virtual'),3700,REPLACE(@tier_index,'.id','.fees."in-person"'),4200) WHERE agency_id=@nlu AND @tier_index IS NOT NULL;

SET @tier_index = JSON_UNQUOTE(JSON_SEARCH((SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=@nlu),'one','L3',NULL,'$.tiers[*].id'));
 UPDATE agency_learning_catalogs SET catalog_json=JSON_SET(catalog_json,REPLACE(@tier_index,'.id','.pay.virtual'),2100,REPLACE(@tier_index,'.id','.pay."in-person"'),2300,REPLACE(@tier_index,'.id','.fees.virtual'),4000,REPLACE(@tier_index,'.id','.fees."in-person"'),4500) WHERE agency_id=@nlu AND @tier_index IS NOT NULL;

SET @tier_index = JSON_UNQUOTE(JSON_SEARCH((SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=@nlu),'one','L4',NULL,'$.tiers[*].id'));
 UPDATE agency_learning_catalogs SET catalog_json=JSON_SET(catalog_json,REPLACE(@tier_index,'.id','.pay.virtual'),2500,REPLACE(@tier_index,'.id','.pay."in-person"'),2700,REPLACE(@tier_index,'.id','.fees.virtual'),5000,REPLACE(@tier_index,'.id','.fees."in-person"'),5500) WHERE agency_id=@nlu AND @tier_index IS NOT NULL;

SET @tier_index = JSON_UNQUOTE(JSON_SEARCH((SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=@nlu),'one','L5',NULL,'$.tiers[*].id'));
 UPDATE agency_learning_catalogs SET catalog_json=JSON_SET(catalog_json,REPLACE(@tier_index,'.id','.pay.virtual'),3000,REPLACE(@tier_index,'.id','.pay."in-person"'),3300,REPLACE(@tier_index,'.id','.fees.virtual'),6000,REPLACE(@tier_index,'.id','.fees."in-person"'),6500) WHERE agency_id=@nlu AND @tier_index IS NOT NULL;

-- No past payroll periods or other employee rate overrides are changed.
INSERT INTO provider_tutoring_profiles (agency_id,user_id,subject_areas_json,grade_levels_json,accepting_new_students,learning_settings_json)
SELECT @nlu,532,JSON_ARRAY(),JSON_ARRAY(),0,JSON_OBJECT('tierId','L4','educationLevel','master','programs',JSON_ARRAY('tutoring','bridge')) FROM users u WHERE u.id=532 AND u.first_name='Kimi' AND u.last_name='Cain' AND EXISTS(SELECT 1 FROM user_agencies WHERE user_id=u.id AND agency_id=@nlu)
ON DUPLICATE KEY UPDATE learning_settings_json=JSON_SET(COALESCE(learning_settings_json,JSON_OBJECT()),'$.tierId','L4','$.educationLevel','master');
INSERT INTO user_agency_practice_categories (agency_id,user_id,category,is_active,effect)
SELECT @nlu,532,c.category,1,'grant' FROM (SELECT 'mental_health' category UNION ALL SELECT 'tutoring') c WHERE @nlu IS NOT NULL AND EXISTS(SELECT 1 FROM user_agencies WHERE user_id=532 AND agency_id=@nlu)
ON DUPLICATE KEY UPDATE is_active=1,effect='grant';
INSERT INTO payroll_user_compensation_levels (agency_id,user_id,category,level)
SELECT @nlu,532,1,4 WHERE @nlu IS NOT NULL AND EXISTS(SELECT 1 FROM user_agencies WHERE user_id=532 AND agency_id=@nlu)
ON DUPLICATE KEY UPDATE category=1,level=4;
INSERT INTO payroll_rates (agency_id,user_id,service_code,rate_amount,rate_unit,effective_start)
SELECT @nlu,532,r.code,r.amount,'per_hour','2026-09-14' FROM (SELECT 'TUTORING VIRTUAL' code,25 amount UNION ALL SELECT 'TUTORING IN PERSON',27) r WHERE @nlu IS NOT NULL AND EXISTS(SELECT 1 FROM user_agencies WHERE user_id=532 AND agency_id=@nlu)
ON DUPLICATE KEY UPDATE rate_amount=VALUES(rate_amount),rate_unit='per_hour';
