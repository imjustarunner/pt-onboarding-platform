-- Add intake_link_id to slot rules and questionnaire responses
-- Allows reusing intake link configuration (intake_fields) in kiosk questionnaire flow

ALTER TABLE office_slot_questionnaire_rules
  ADD COLUMN intake_link_id INT NULL COMMENT 'optional: use intake link instead of module' AFTER module_id,
  ADD CONSTRAINT fk_slot_rules_intake FOREIGN KEY (intake_link_id) REFERENCES intake_links(id) ON DELETE CASCADE;

ALTER TABLE office_slot_questionnaire_rules
  MODIFY COLUMN module_id INT NULL COMMENT 'null when intake_link_id is set';

ALTER TABLE office_questionnaire_responses
  ADD COLUMN intake_link_id INT NULL COMMENT 'when set, response from intake link form' AFTER module_id,
  MODIFY COLUMN module_id INT NULL,
  ADD CONSTRAINT fk_office_qr_intake FOREIGN KEY (intake_link_id) REFERENCES intake_links(id) ON DELETE SET NULL;
