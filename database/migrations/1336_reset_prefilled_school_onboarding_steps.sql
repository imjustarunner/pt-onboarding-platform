-- Migration 1336: Reset school_information when only step 1 was saved before the contact logged in
-- (typically ITSCO staff previewing the onboarding link — not auto from outreach invite create)

UPDATE school_onboarding_invites i
INNER JOIN users u ON u.id = i.primary_user_id
LEFT JOIN user_activity_log al ON al.user_id = u.id AND al.action_type = 'login'
SET
  i.step_progress = JSON_SET(COALESCE(i.step_progress, JSON_OBJECT()), '$.school_information', 'not_started'),
  i.step_payload = JSON_REMOVE(COALESCE(i.step_payload, JSON_OBJECT()), '$.school_information'),
  i.recipient_started_at = NULL,
  i.status = 'invited'
WHERE i.submitted_at IS NULL
  AND i.password_set_at IS NULL
  AND u.password_hash IS NULL
  AND al.id IS NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(i.step_progress, '$.school_information')) = 'complete'
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.step_progress, '$.school_staff')), 'not_started') = 'not_started'
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.step_progress, '$.preferred_days')), 'not_started') = 'not_started'
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.step_progress, '$.welcome_materials')), 'not_started') = 'not_started'
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.step_progress, '$.explore_demo')), 'not_started') = 'not_started';
