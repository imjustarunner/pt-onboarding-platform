-- Phase 4: additional admin controls for inbound email AI policy.

ALTER TABLE agency_email_settings
  ADD COLUMN ai_allowed_intents_json JSON NULL AFTER allow_school_overrides,
  ADD COLUMN ai_match_confidence_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.75 AFTER ai_allowed_intents_json,
  ADD COLUMN ai_allowed_sender_identity_keys_json JSON NULL AFTER ai_match_confidence_threshold;

ALTER TABLE school_email_ai_policy_overrides
  ADD COLUMN allowed_intents_json JSON NULL AFTER policy_mode,
  ADD COLUMN match_confidence_threshold DECIMAL(4,2) NULL AFTER allowed_intents_json,
  ADD COLUMN allowed_sender_identity_keys_json JSON NULL AFTER match_confidence_threshold;
