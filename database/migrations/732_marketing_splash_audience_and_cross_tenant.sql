-- Extend the marketing splash model to support:
--   1. Audience kinds (school_staff vs admin/support/staff vs provider, etc.)
--      so the same toast can surface on the regular dashboard, not just school
--      portals.
--   2. Cross-tenant targeting (super_admin only): an agency originates a
--      campaign and additionally pushes it into other tenants. The owning
--      agency continues to own/edit; the target tenants' staff/providers and
--      school staff just consume.
--
-- Old behavior is preserved when both new columns are NULL/empty by reading
-- audience_school_staff_only as the legacy fallback (handled in controller).

ALTER TABLE agency_marketing_splashes
  ADD COLUMN audience_kinds JSON NULL
    COMMENT 'Array of role keys that should see the toast: ["school_staff", "admin", "support", "staff", "provider", "intern", "clinical_practice_assistant", "supervisor", "schedule_manager"]. Empty/NULL falls back to the legacy audience_school_staff_only flag.'
    AFTER audience_school_staff_only,
  ADD COLUMN cross_tenant_target_agency_ids JSON NULL
    COMMENT 'super_admin only: array of additional agency ids to push this splash into (school portals + staff dashboards in those tenants).'
    AFTER audience_kinds,
  ADD COLUMN is_cross_tenant TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Convenience flag set by the controller when cross_tenant_target_agency_ids is non-empty.'
    AFTER cross_tenant_target_agency_ids;
