-- Public/guardian registration catalog flags for company events and learning classes

ALTER TABLE company_events
  ADD COLUMN registration_eligible TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, event appears in guardian registration catalog for the agency'
    AFTER learning_program_class_id,
  ADD COLUMN medicaid_eligible TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, payerType=medicaid allowed on guardian enroll'
    AFTER registration_eligible,
  ADD COLUMN cash_eligible TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, payerType=cash allowed on guardian enroll'
    AFTER medicaid_eligible;

ALTER TABLE learning_program_classes
  ADD COLUMN registration_eligible TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, class appears in guardian registration catalog'
    AFTER max_clients,
  ADD COLUMN medicaid_eligible TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, payerType=medicaid allowed on guardian enroll'
    AFTER registration_eligible,
  ADD COLUMN cash_eligible TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, payerType=cash allowed on guardian enroll'
    AFTER medicaid_eligible;
