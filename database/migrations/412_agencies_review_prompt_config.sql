-- Migration: Add review prompt configuration to agencies
-- Description: Agency-level config for "Do you like our services?" popup in school portals.
-- Admins can set a review link (Google, Indeed, etc.), survey link, and custom message.
-- Pushed to school staff and providers who work with the agency.

ALTER TABLE agencies
  ADD COLUMN review_prompt_config JSON NULL COMMENT 'Review/survey prompt: enabled, reviewLink, surveyLink, message, platformLabel';
