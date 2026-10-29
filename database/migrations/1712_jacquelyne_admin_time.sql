-- Jacquelyne Fernandez (ITSCO only): third Log Time category, effective Oct 29.
ALTER TABLE payroll_indirect_service_types
  MODIFY COLUMN pay_bucket ENUM('indirect','other_1','support','supervision_note','admin') NOT NULL DEFAULT 'indirect';

START TRANSACTION;
SET @jacquelyne_id = (
  SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=2
  WHERE u.id=485 AND u.first_name='Jacquelyne' AND u.last_name='Fernandez' LIMIT 1
);

INSERT INTO payroll_rates
  (agency_id,user_id,service_code,rate_amount,rate_unit,effective_start,effective_end)
SELECT 2,@jacquelyne_id,'Admin Time',25.00,'per_hour','2026-10-29',NULL
WHERE @jacquelyne_id IS NOT NULL
ON DUPLICATE KEY UPDATE rate_amount=25.00,rate_unit='per_hour',effective_end=NULL;

INSERT INTO payroll_indirect_service_types
  (agency_id,type_key,label,description,icon_key,pay_bucket,sort_order,is_active,display_code)
SELECT 2,d.type_key,d.label,d.description,d.icon_key,d.pay_bucket,d.sort_order,1,d.display_code
FROM (
 SELECT 'jacquelyne_outreach' type_key,'Outreach' label,'Admin-directed outreach to develop new Denver school relationships or maintain existing ones. Name the directing admin and school in your note. Submit trips through Outreach travel reimbursement using an assigned event.' description,'megaphone' icon_key,'admin' pay_bucket,410 sort_order,'ADM-01' display_code
 UNION ALL SELECT 'jacquelyne_translation','Translation','Translation that assists support staff or helps providers obtain information, only when that time is not already compensated as direct time or another claim.','phone','admin',420,'ADM-02'
 UNION ALL SELECT 'jacquelyne_onboarding','Onboarding help','Actual scheduled huddles in the app with new Denver staff about operations, office tours, or interview participation. Paid at Admin Time. Select the huddle; do not duplicate automatically recorded attendance.','user-check','admin',430,'ADM-03'
 UNION ALL SELECT 'jacquelyne_team_functions','Team functions','Participating in team functions at the direction of admin. Paid at Support Activity. Exclude attendance already recorded or paid through an event or meeting.','users','support',270,'SUP-J01'
 UNION ALL SELECT 'jacquelyne_team_function_planning','Organizing team functions','Planning, coordinating, and organizing team functions at the direction of admin. Record the function and work performed. Paid at Support Activity.','calendar','support',280,'SUP-J02'
 UNION ALL SELECT 'jacquelyne_team_checkins','Team check-ins','Admin-directed team check-ins. Paid at Support Activity. Do not duplicate automatic meeting records. Scheduled onboarding huddles with new Denver staff belong under Admin Time.','users','support',290,'SUP-J03'
 UNION ALL SELECT 'jacquelyne_office_management','Denver office management','Visit and organize the Denver office, check that it is maintained and ready for staff, and maintain the relationship with the sublessee. Paid at Support Activity.','clipboard','support',300,'SUP-J04'
) d WHERE @jacquelyne_id IS NOT NULL
ON DUPLICATE KEY UPDATE label=VALUES(label),description=VALUES(description),icon_key=VALUES(icon_key),pay_bucket=VALUES(pay_bucket),sort_order=VALUES(sort_order),is_active=1,display_code=VALUES(display_code);

-- Explicit assignment makes the new duties private; server validation also enforces ownership.
INSERT INTO payroll_user_indirect_service_assignments
 (agency_id,user_id,service_type_id,is_enabled,rate_override)
SELECT 2,@jacquelyne_id,id,1,IF(pay_bucket='admin',25.00,NULL)
FROM payroll_indirect_service_types WHERE agency_id=2 AND type_key LIKE 'jacquelyne\_%' AND @jacquelyne_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_enabled=1,rate_override=VALUES(rate_override);

-- Remove conflicting legacy choices for this employee only. Keep the standard indirect catalog.
INSERT INTO payroll_user_indirect_service_assignments
 (agency_id,user_id,service_type_id,is_enabled,rate_override)
SELECT 2,@jacquelyne_id,id,0,NULL FROM payroll_indirect_service_types
WHERE agency_id=2 AND @jacquelyne_id IS NOT NULL AND type_key IN
 ('outreach_activities','prep_for_outreach','travel_for_outreach','virtual_outreach','outreach_meetings','bilingual_coordination','bilingual_intakes_not_billed','onboarding_sa')
ON DUPLICATE KEY UPDATE is_enabled=0,rate_override=NULL;
COMMIT;
