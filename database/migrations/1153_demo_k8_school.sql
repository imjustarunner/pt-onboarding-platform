-- Migration 1153: Demo K-8 School under Demo Playground tenant

SET @demo_playground_id = (
  SELECT id FROM agencies WHERE slug = 'demo' AND organization_type = 'agency' LIMIT 1
);

INSERT INTO agencies (
  name,
  official_name,
  slug,
  portal_url,
  organization_type,
  is_active,
  is_archived,
  color_palette,
  theme_settings,
  feature_flags
)
SELECT
  'Demo K-8 School',
  'Demo K-8 School',
  'demo-school',
  'demo-school',
  'school',
  1,
  0,
  CAST('{"primary":"#4F46E5","secondary":"#0D9488","accent":"#F59E0B"}' AS JSON),
  CAST('{"fontFamily":"Inter, sans-serif","useExtendedBrandingColors":true}' AS JSON),
  CAST('{"noteAidEnabled":true,"focusMusicEnabled":true,"focusPackageEnabled":true,"clinicalNoteGeneratorEnabled":true,"schoolPortalsEnabled":true}' AS JSON)
FROM DUAL
WHERE @demo_playground_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agencies WHERE slug = 'demo-school'
  );

SET @demo_school_id = (
  SELECT id FROM agencies WHERE slug = 'demo-school' AND organization_type = 'school' LIMIT 1
);

INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
SELECT @demo_playground_id, @demo_school_id, 1
FROM DUAL
WHERE @demo_playground_id IS NOT NULL
  AND @demo_school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_affiliations
    WHERE agency_id = @demo_playground_id AND organization_id = @demo_school_id
  );

INSERT INTO agency_schools (agency_id, school_organization_id, is_active)
SELECT @demo_playground_id, @demo_school_id, 1
FROM DUAL
WHERE @demo_playground_id IS NOT NULL
  AND @demo_school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agency_schools
    WHERE agency_id = @demo_playground_id AND school_organization_id = @demo_school_id
  );

INSERT INTO school_profiles (
  school_organization_id,
  district_name,
  school_number,
  school_days_times,
  bell_schedule_start_time,
  bell_schedule_end_time,
  school_address,
  location_label,
  primary_contact_name,
  primary_contact_email,
  primary_contact_role
)
SELECT
  @demo_school_id,
  'Demo District 2',
  'D2-K8-001',
  'Monday–Friday 8:00 AM – 3:30 PM',
  '08:00:00',
  '15:30:00',
  '100 Demo School Way, Colorado Springs, CO 80903',
  'Demo K-8 Campus',
  'Demo School Staff Admin',
  'dssa@demtest.com',
  'School Administrator'
FROM DUAL
WHERE @demo_school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM school_profiles WHERE school_organization_id = @demo_school_id
  );
