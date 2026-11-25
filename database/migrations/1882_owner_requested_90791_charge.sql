-- Owner-requested billed charge: 90791 = $135 in every current practice.
-- Append explicit release-automation records; never attribute migration work to a person.
ALTER TABLE medical_fee_schedule_rates MODIFY actor_user_id INT NULL,
 ADD COLUMN actor_automation_key VARCHAR(128) NULL;
INSERT IGNORE INTO medical_fee_schedule_state(owner_key,revision) VALUES('platform',0);
INSERT IGNORE INTO medical_fee_schedule_state(owner_key,revision)
 SELECT DISTINCT CONCAT('agency:',agency_id),0 FROM agency_medical_service_codes WHERE service_code='90791';
CREATE TEMPORARY TABLE release_1882_previous_90791 AS
 SELECT r.* FROM medical_fee_schedule_rates r JOIN (
 SELECT MAX(id) id FROM medical_fee_schedule_rates WHERE service_code='90791' AND record_type='rate'
 GROUP BY owner_key,mode,scope_key) latest ON latest.id=r.id;
INSERT INTO medical_fee_schedule_rates(owner_key,agency_id,revision,record_type,mode,scope_key,service_code,rate_cents,rate_unit,action,reason,actor_user_id,actor_automation_key)
 SELECT r.owner_key,r.agency_id,s.revision+1,'rate',r.mode,r.scope_key,'90791',13500,IF(r.mode='insurance','unit','session'),
 'system_charge_update','Owner requested 90791 at $135 across current billing defaults; historical claim amounts retained.',NULL,'github-actions:release-migration:1882'
 FROM release_1882_previous_90791 r JOIN medical_fee_schedule_state s ON s.owner_key=r.owner_key
 WHERE r.scope_key NOT IN ('platform','practice');
INSERT INTO medical_fee_schedule_rates(owner_key,agency_id,revision,record_type,mode,scope_key,service_code,rate_cents,rate_unit,action,reason,actor_user_id,actor_automation_key)
 SELECT s.owner_key,c.agency_id,s.revision+1,'rate',m.mode,'practice','90791',13500,IF(m.mode='insurance','unit','session'),
 'system_charge_update','Owner requested 90791 at $135 across current billing defaults; historical claim amounts retained.',NULL,'github-actions:release-migration:1882'
 FROM (SELECT DISTINCT agency_id FROM agency_medical_service_codes WHERE service_code='90791') c
 JOIN medical_fee_schedule_state s ON s.owner_key=CONCAT('agency:',c.agency_id)
 CROSS JOIN (SELECT 'insurance' mode UNION ALL SELECT 'self_pay') m;
INSERT INTO medical_fee_schedule_rates(owner_key,agency_id,revision,record_type,mode,scope_key,service_code,rate_cents,rate_unit,action,reason,actor_user_id,actor_automation_key)
 SELECT 'platform',NULL,s.revision+1,'rate',m.mode,'platform','90791',13500,IF(m.mode='insurance','unit','session'),
 'system_charge_update','Owner requested 90791 at $135 as the platform default.',NULL,'github-actions:release-migration:1882'
 FROM medical_fee_schedule_state s CROSS JOIN (SELECT 'insurance' mode UNION ALL SELECT 'self_pay') m WHERE s.owner_key='platform';
UPDATE medical_fee_schedule_state SET revision=revision+1 WHERE owner_key='platform'
 OR owner_key IN (SELECT DISTINCT CONCAT('agency:',agency_id) FROM agency_medical_service_codes WHERE service_code='90791')
 OR owner_key IN (SELECT owner_key FROM release_1882_previous_90791 WHERE scope_key NOT IN ('platform','practice'));
UPDATE tenant_services SET price_cents=13500 WHERE UPPER(TRIM(service_code))='90791';
DROP TEMPORARY TABLE release_1882_previous_90791;
