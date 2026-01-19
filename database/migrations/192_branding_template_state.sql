-- Migration: Add default/current branding template state
-- Description: Persist which branding template is the default/current at platform and agency scope.

-- Platform branding template state
ALTER TABLE platform_branding
  ADD COLUMN default_branding_template_id INT NULL AFTER id,
  ADD COLUMN current_branding_template_id INT NULL AFTER default_branding_template_id,
  ADD CONSTRAINT fk_platform_branding_default_template
    FOREIGN KEY (default_branding_template_id) REFERENCES branding_templates(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_branding_current_template
    FOREIGN KEY (current_branding_template_id) REFERENCES branding_templates(id) ON DELETE SET NULL;

-- Agencies (all org types) template state
ALTER TABLE agencies
  ADD COLUMN default_branding_template_id INT NULL AFTER settings_icon_id,
  ADD COLUMN current_branding_template_id INT NULL AFTER default_branding_template_id,
  ADD CONSTRAINT fk_agencies_default_template
    FOREIGN KEY (default_branding_template_id) REFERENCES branding_templates(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agencies_current_template
    FOREIGN KEY (current_branding_template_id) REFERENCES branding_templates(id) ON DELETE SET NULL;

