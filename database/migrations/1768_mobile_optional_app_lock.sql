-- Existing codes keep protecting their devices. New sign-ins may opt into an
-- app lock; declining it retains the device sign-in and the phone's screen lock.
ALTER TABLE mobile_device_sessions
  ADD COLUMN app_lock_method VARCHAR(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'none',
  ADD COLUMN app_lock_version INT UNSIGNED NOT NULL DEFAULT 0;
UPDATE mobile_device_sessions SET app_lock_method='code' WHERE quick_code_hash IS NOT NULL;
