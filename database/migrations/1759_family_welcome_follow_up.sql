-- Migration 1759: Family Welcome & Follow-Up PDF choice and opt-in splash tracking
ALTER TABLE school_provider_contact_plans
  ADD COLUMN include_pdf TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Attach the provider school introduction PDF to the welcome email',
  ADD COLUMN welcome_seen_at DATETIME NULL DEFAULT NULL
    COMMENT 'When the provider answered the Family Welcome & Follow-Up opt-in splash';
