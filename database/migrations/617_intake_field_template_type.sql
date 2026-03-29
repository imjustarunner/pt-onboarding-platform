-- Add template_type discriminator to agency_intake_field_templates.
-- Existing rows default to 'field_template'; question sets use 'question_set'.
ALTER TABLE agency_intake_field_templates
  ADD COLUMN template_type VARCHAR(32) NOT NULL DEFAULT 'field_template'
    COMMENT 'Discriminates field templates from reusable question sets'
    AFTER name;
