-- Migration 1218: independent office printable packets for self vs parent/guardian
ALTER TABLE office_packet_templates
  ADD COLUMN variant VARCHAR(16) NOT NULL DEFAULT 'self'
  COMMENT 'self = adult client packet; parent = guardian/child packet'
  AFTER locale;

ALTER TABLE office_packet_templates
  DROP INDEX uniq_office_packet_template_agency_locale;

ALTER TABLE office_packet_templates
  ADD UNIQUE KEY uniq_office_packet_agency_locale_variant (agency_id, locale, variant);

ALTER TABLE office_packet_template_versions
  ADD COLUMN variant VARCHAR(16) NOT NULL DEFAULT 'self'
  COMMENT 'self = adult client packet; parent = guardian/child packet'
  AFTER locale;

ALTER TABLE office_packet_template_versions
  DROP INDEX uniq_office_packet_ver;

ALTER TABLE office_packet_template_versions
  ADD UNIQUE KEY uniq_office_packet_ver (agency_id, locale, variant, version);
