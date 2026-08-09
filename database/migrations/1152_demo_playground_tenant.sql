-- Migration 1152: Create Demo Playground tenant and archive old Demo ITSCO
-- - Renames legacy slug 'demo' (id 381) so the new playground can own it
-- - Clones ITSCO feature flags with SSO disabled
-- - Copies client/paperwork/insurance dictionaries from ITSCO
-- - Carries over user_agencies membership from legacy demo tenant (clean data slate)

-- 1) Free the 'demo' slug / portal_url by archiving the old tenant
UPDATE agencies
SET
  name = 'Demo ITSCO (Archived)',
  slug = 'demo-itsco-legacy',
  portal_url = 'demo-itsco-legacy',
  is_active = 0,
  is_archived = 1,
  archived_at = COALESCE(archived_at, NOW()),
  updated_at = NOW()
WHERE id = 381
  AND slug = 'demo';

-- 2) Create Demo Playground (idempotent by slug)
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
  'Demo Playground',
  'Demo Playground',
  'demo',
  'demo',
  'agency',
  1,
  0,
  CAST('{"primary":"#4F46E5","secondary":"#0D9488","accent":"#F59E0B"}' AS JSON),
  CAST('{"fontFamily":"Inter, sans-serif","useExtendedBrandingColors":true}' AS JSON),
  CAST('{
    "kudosEnabled": true,
    "hiringEnabled": true,
    "portalVariant": "healthcare_provider",
    "noteAidEnabled": true,
    "payrollEnabled": true,
    "bookClubEnabled": true,
    "presenceEnabled": true,
    "googleSsoEnabled": false,
    "medcancelEnabled": true,
    "peopleOpsEnabled": true,
    "focusMusicEnabled": true,
    "focusPackageEnabled": true,
    "momentumListEnabled": true,
    "gamesPlatformEnabled": true,
    "schoolPortalsEnabled": true,
    "shiftProgramsEnabled": false,
    "workspaceEmailDomain": "",
    "workspaceEmailFormat": "",
    "medicalBillingEnabled": true,
    "googleSsoRequiredRoles": [],
    "guardianWaiversEnabled": true,
    "aiProviderSearchEnabled": true,
    "budgetManagementEnabled": false,
    "googleSsoAllowedDomains": [],
    "tenantFeatureProfileKey": "essential_baseline",
    "standardsLearningEnabled": false,
    "trainingAiBuilderEnabled": true,
    "groupClassSessionsEnabled": false,
    "onboardingTrainingEnabled": true,
    "percentOfChargePayEnabled": false,
    "smsAutoProvisionOnPrehire": false,
    "inSchoolSubmissionsEnabled": true,
    "publicProviderFinderEnabled": false,
    "clinicalNoteGeneratorEnabled": true,
    "otherMileageTierRatesEnabled": true,
    "workspaceProvisioningEnabled": false,
    "platformSharedMarketingEnabled": true,
    "submitEnabledForEmployeePortal": false,
    "platformPublicRegistrationEnabled": true,
    "returningGuardianAutoMatchEnabled": false,
    "skillBuildersSchoolProgramEnabled": true
  }' AS JSON)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM agencies WHERE slug = 'demo'
);

SET @demo_playground_id = (
  SELECT id FROM agencies WHERE slug = 'demo' AND organization_type = 'agency' LIMIT 1
);

SET @itsco_id = (
  SELECT id FROM agencies WHERE slug = 'itsco' AND organization_type = 'agency' LIMIT 1
);

-- 3) Copy dictionaries from ITSCO onto Demo Playground
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT @demo_playground_id, cs.status_key, cs.label, cs.description, cs.is_active
FROM client_statuses cs
WHERE cs.agency_id = @itsco_id
  AND @demo_playground_id IS NOT NULL
  AND @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_statuses x
    WHERE x.agency_id = @demo_playground_id AND x.status_key = cs.status_key
  );

INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT @demo_playground_id, ps.status_key, ps.label, ps.description, ps.is_active
FROM paperwork_statuses ps
WHERE ps.agency_id = @itsco_id
  AND @demo_playground_id IS NOT NULL
  AND @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM paperwork_statuses x
    WHERE x.agency_id = @demo_playground_id AND x.status_key = ps.status_key
  );

INSERT INTO insurance_types (agency_id, insurance_key, label, is_active)
SELECT @demo_playground_id, it.insurance_key, it.label, it.is_active
FROM insurance_types it
WHERE it.agency_id = @itsco_id
  AND @demo_playground_id IS NOT NULL
  AND @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM insurance_types x
    WHERE x.agency_id = @demo_playground_id AND x.insurance_key = it.insurance_key
  );

-- 4) Carry over membership from archived Demo ITSCO (access only — no clients/schedules)
INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT ua.user_id, @demo_playground_id, 1
FROM user_agencies ua
WHERE ua.agency_id = 381
  AND @demo_playground_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies x
    WHERE x.user_id = ua.user_id AND x.agency_id = @demo_playground_id
  );
