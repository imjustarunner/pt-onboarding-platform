-- Migration 1273: Allow one-shot Expiring Background emails for already-expired checks
ALTER TABLE expiring_background_email_log
  MODIFY COLUMN tier ENUM('90d', '30d', '7d', 'expired')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
