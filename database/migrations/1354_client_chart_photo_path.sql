-- Migration 1354: optional chart photo for clients (tutors/coaching/consultants); clinical clients default to initials
ALTER TABLE clients
  ADD COLUMN chart_photo_path VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
  COMMENT 'Optional profile photo for chart UI (coaching/tutor/consultant). Clinical clients typically leave null and show initials.';
