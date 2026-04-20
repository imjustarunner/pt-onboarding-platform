-- Add the missing `is_required` column to challenge_custom_field_definitions.
--
-- The Summit Stats invite-resolve endpoint
-- (challengeMemberApplications.resolveInviteToken) and the public
-- application form (SstcMemberApplicationView) both expect this column
-- to exist so the form can render an asterisk and enforce HTML-level
-- `required` on member-facing custom profile fields.
--
-- It was never created in 637_summit_stats_recognition_and_profiles_overhaul.sql,
-- which caused a 500 with "Unknown column 'is_required' in 'field list'"
-- whenever someone clicked a season fast-track invite link.

ALTER TABLE challenge_custom_field_definitions
  ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, the public application form must collect this field before submission.'
    AFTER unit_label;
