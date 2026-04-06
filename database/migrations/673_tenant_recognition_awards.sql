-- Migration: Add tenant-level template flag to recognition awards
-- is_tenant_template = 1: row is a shared tenant-level template (agency_id = tenant agency)
-- is_tenant_template = 0: row is a club-level award (agency_id = club agency)
-- Club-scoped queries must add: AND (is_tenant_template = 0 OR is_tenant_template IS NULL)

ALTER TABLE challenge_recognition_awards
  ADD COLUMN is_tenant_template TINYINT(1) NOT NULL DEFAULT 0 AFTER agency_id;

CREATE INDEX idx_cra_tenant_template ON challenge_recognition_awards (is_tenant_template);
