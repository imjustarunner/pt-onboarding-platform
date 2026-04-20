-- Migration: Convert user_activity_log.action_type from ENUM to VARCHAR(100)
-- Description: The ENUM (last widened in 708) only covered ~21 of the action types
--              the application actually emits. Every other logAuditEvent()/
--              ActivityLogService.logActivity() call for school portal views,
--              SMS activity, voice calls, client ROI events, client access,
--              clinical note lifecycle, payroll writes, billing policy changes,
--              etc. was being rejected by MySQL (ER_TRUNCATED_WRONG_VALUE, 1265)
--              and swallowed by the "best effort" catch, so no row was written.
--
--              Mirrors the pattern established in migration
--              080_convert_notification_type_to_varchar.sql: keep validation in
--              application code (action_type registry in
--              backend/src/config/auditActionRegistry.js and the frontend
--              registry), allow the column to accept any documented action
--              type, and retain the existing idx_action_type index.
--
-- This migration is idempotent. Running it on an already-VARCHAR column is a
-- no-op ALTER in MySQL.

ALTER TABLE user_activity_log
    MODIFY COLUMN action_type VARCHAR(100) NOT NULL;

-- Sanity: trim any rows with stray whitespace so filter queries match cleanly.
UPDATE user_activity_log
SET action_type = TRIM(action_type)
WHERE action_type <> TRIM(action_type);
