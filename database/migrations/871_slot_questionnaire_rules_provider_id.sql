-- Migration 871: Add provider_id to office_slot_questionnaire_rules
-- Allows providers to create questionnaire rules that fire only for their own booked slots,
-- independent of room/day/hour. Provider-specific rules take priority over room-level rules.

ALTER TABLE office_slot_questionnaire_rules
  ADD COLUMN provider_id INT NULL
    COMMENT 'null = all providers; set = only fires when this provider is the booked_provider_id'
    AFTER office_location_id,
  ADD CONSTRAINT fk_slot_rules_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD INDEX idx_slot_rules_provider (provider_id);
