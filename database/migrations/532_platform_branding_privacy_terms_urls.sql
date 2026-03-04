-- Migration: Add privacy policy and terms URLs to platform branding
-- Description: Platform-level URLs for login page footer and A2P/SMS compliance.
-- Used for: Twilio A2P 10DLC, login page links, general legal pages.

ALTER TABLE platform_branding
  ADD COLUMN privacy_policy_url VARCHAR(2048) NULL COMMENT 'URL to privacy policy (platform-level)' AFTER tagline,
  ADD COLUMN terms_url VARCHAR(2048) NULL COMMENT 'URL to terms and conditions (platform-level)' AFTER privacy_policy_url;
