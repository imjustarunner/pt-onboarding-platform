-- Migration: Set supervisor privileges for existing supervisors
-- Description: Set has_supervisor_privileges = TRUE for all users where role = 'supervisor'
-- This makes the boolean the source of truth for supervisor identification

UPDATE users
SET has_supervisor_privileges = TRUE
WHERE role = 'supervisor' AND (has_supervisor_privileges IS NULL OR has_supervisor_privileges = FALSE);
