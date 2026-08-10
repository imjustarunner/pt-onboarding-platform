-- Migration 1174: add locale support to school_packet_templates (EN + ES per agency)

ALTER TABLE school_packet_templates
  ADD COLUMN locale VARCHAR(8) NOT NULL DEFAULT 'en'
  COMMENT 'Language code for this agency packet template (en or es)';

ALTER TABLE school_packet_templates
  DROP INDEX uniq_school_packet_template_agency;

ALTER TABLE school_packet_templates
  ADD UNIQUE KEY uniq_school_packet_template_agency_locale (agency_id, locale);

UPDATE school_packet_templates
SET locale = 'en'
WHERE locale IS NULL OR locale = '';
