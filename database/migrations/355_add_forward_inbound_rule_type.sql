-- Migration: Add forward_inbound rule type for twilio_number_rules

ALTER TABLE twilio_number_rules
  MODIFY COLUMN rule_type ENUM(
    'after_hours',
    'opt_in',
    'opt_out',
    'help',
    'emergency_forward',
    'auto_reply',
    'forward_inbound'
  ) NOT NULL;
