-- Migration: Cleanup provider-profile checklist experiment
-- Description: Drops provider_profile_* tables created for the discarded checklist-based approach and removes seeded checklist items.

-- Drop provider profile tables (if they exist)
DROP TABLE IF EXISTS provider_internal_notes;
DROP TABLE IF EXISTS provider_bio_profiles;
DROP TABLE IF EXISTS provider_demographics;
DROP TABLE IF EXISTS provider_payer_profiles;
DROP TABLE IF EXISTS provider_licenses;
DROP TABLE IF EXISTS provider_marketing_profiles;
DROP TABLE IF EXISTS provider_work_schedule_blocks;

-- Remove seeded provider-profile checklist items (if they exist)
DELETE acei
FROM agency_checklist_enabled_items acei
JOIN custom_checklist_items cci ON cci.id = acei.checklist_item_id
WHERE cci.is_platform_template = TRUE
  AND cci.item_key IN (
    'provider_work_schedule',
    'provider_school_availability',
    'provider_marketing_profile',
    'provider_clinical_credentials',
    'provider_getting_to_know_you'
  );

DELETE FROM custom_checklist_items
WHERE is_platform_template = TRUE
  AND item_key IN (
    'provider_work_schedule',
    'provider_school_availability',
    'provider_marketing_profile',
    'provider_clinical_credentials',
    'provider_getting_to_know_you'
  );

