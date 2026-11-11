-- App privacy is mandatory. The account's existing Quick View code is reused;
-- obsolete per-device PINs must not remain as an alternate authenticator.
ALTER TABLE mobile_device_sessions ALTER COLUMN app_lock_method SET DEFAULT 'code';

UPDATE mobile_device_sessions
SET app_lock_method=CASE WHEN app_lock_method='biometric' THEN 'biometric' ELSE 'code' END,
    quick_code_hash=NULL,
    app_lock_version=app_lock_version+1;

-- Keep durable enrollment, primary-authentication timestamps, push registration,
-- and account credentials. Existing unlocked grants must lock on their next call.
UPDATE quick_view_sessions
SET revoked_at=CURRENT_TIMESTAMP
WHERE mobile_device_session_id IS NOT NULL AND revoked_at IS NULL;
