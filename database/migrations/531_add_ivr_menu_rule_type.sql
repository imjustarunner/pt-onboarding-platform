-- Migration: Add ivr_menu rule type for Twilio voice IVR
-- schedule_json stores: { "prompt": "...", "options": { "1": { "action": "dial_support" }, "2": { "action": "main_line" }, ... } }
-- Actions: main_line, extension_menu, dial_support, dial_phone (requires "phone" in option)

ALTER TABLE twilio_number_rules
  MODIFY COLUMN rule_type ENUM(
    'after_hours',
    'opt_in',
    'opt_out',
    'help',
    'emergency_forward',
    'auto_reply',
    'forward_inbound',
    'ivr_menu'
  ) NOT NULL;
