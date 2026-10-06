-- Retire the school ROI rollout hold; keep sender verification and content checks.
ALTER TABLE agency_email_settings ALTER COLUMN school_roi_emails_require_approval SET DEFAULT 0;
UPDATE agency_email_settings SET school_roi_emails_require_approval=0;
-- Schools is the branded ROI sender; route replies to that tenant's support inbox.
UPDATE email_sender_identities SET reply_to=CONCAT('support@',SUBSTRING_INDEX(from_email,'@',-1))
WHERE identity_key='schools' AND LOWER(from_email) LIKE 'schools@%';

UPDATE agency_email_settings a
JOIN email_sender_identities i ON i.agency_id=a.agency_id AND i.identity_key='schools' AND i.is_active=1
SET a.template_sender_identity_json=JSON_SET(COALESCE(a.template_sender_identity_json,JSON_OBJECT()),
 '$.school_roi_signing',i.id,'$.school_roi_signer_completion',i.id,'$.school_roi_release',i.id,'$.smart_school_roi',i.id)
WHERE LOWER(i.from_email) LIKE 'schools@%';
