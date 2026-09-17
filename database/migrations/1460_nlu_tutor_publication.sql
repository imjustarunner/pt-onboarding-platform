-- Repair the missing tutoring enrollment for Kimi's existing NLU learning profile.
-- Preserve explicit unpublished decisions and current accepting-new-student settings.
INSERT INTO provider_public_service_enrollments (agency_id,user_id,service_type,is_active)
SELECT a.id,u.id,'tutoring',1
FROM agencies a JOIN user_agencies ua ON ua.agency_id=a.id
JOIN users u ON u.id=ua.user_id
JOIN provider_tutoring_profiles p ON p.agency_id=a.id AND p.user_id=u.id
WHERE a.slug='nlu' AND u.id=532 AND u.first_name='Kimi' AND u.last_name='Cain'
 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_active,1)=1
 AND NOT EXISTS (SELECT 1 FROM provider_public_service_enrollments e WHERE e.agency_id=a.id AND e.user_id=u.id AND e.service_type='tutoring');
